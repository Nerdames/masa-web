import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, Role, NotificationType } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/* -------------------- AUTH & ACCESS -------------------- */

async function getAuthContext(req: NextRequest) {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token || typeof token.id !== "string" || token.expired) return null;

  return {
    userId: token.id,
    role: (token.role as Role) || Role.CASHIER,
    organizationId: token.organizationId as string,
    branchId: (token.branchId as string) ?? null,
    isOrgOwner: !!token.isOrgOwner,
  };
}

const CAN_MANAGE_PERSONNEL = [Role.ADMIN, Role.MANAGER];

/* -------------------- HELPERS -------------------- */

const ROLE_CODE: Record<Role, string> = {
  DEV: "00",
  ADMIN: "01",
  MANAGER: "02",
  SALES: "03",
  INVENTORY: "04",
  CASHIER: "05",
};

/**
 * Generates Staff Code in format: STF-NNRRBB
 * NN = Sequence number, RR = Role Code, BB = Branch ID suffix
 */
async function generateStaffCode(
  tx: Omit<Prisma.TransactionClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  organizationId: string,
  branchId: string | null,
  role: Role
) {
  const count = await tx.authorizedPersonnel.count({ where: { organizationId } });
  const nn = (count + 1).toString().padStart(2, "0");
  const rr = ROLE_CODE[role] || "99";
  const bb = branchId ? branchId.slice(-2).toUpperCase() : "00";

  return `STF-${nn}${rr}${bb}`;
}

/* -------------------- GET: LIST & ANALYTICS -------------------- */

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !CAN_MANAGE_PERSONNEL.includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 10), 1), 100);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status"); // 'active', 'disabled', 'locked'

    // Scoping query: Managers only see their branch, Admins/Owners see the whole Org
    const baseWhere: Prisma.AuthorizedPersonnelWhereInput = {
      deletedAt: null,
      organizationId: auth.organizationId,
      ...(auth.role === Role.MANAGER && auth.branchId && !auth.isOrgOwner && {
        branchAssignments: { some: { branchId: auth.branchId } }
      }),
    };

    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { staffCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const paginationWhere: Prisma.AuthorizedPersonnelWhereInput = { ...baseWhere };
    if (status === "active") {
      paginationWhere.disabled = false;
      paginationWhere.isLocked = false;
    } else if (status === "disabled") {
      paginationWhere.disabled = true;
    } else if (status === "locked") {
      paginationWhere.isLocked = true;
    }

    const [total, data, branches, recentLogs, statusCounts] = await Promise.all([
      prisma.authorizedPersonnel.count({ where: paginationWhere }),
      prisma.authorizedPersonnel.findMany({
        where: paginationWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { lastActivityAt: "desc" },
        include: {
          branch: { select: { id: true, name: true } },
          branchAssignments: { include: { branch: { select: { name: true } } } }
        },
      }),
      prisma.branch.findMany({
        where: { organizationId: auth.organizationId, deletedAt: null },
        select: { id: true, name: true, _count: { select: { personnel: true } } }
      }),
      prisma.activityLog.findMany({
        where: {
          organizationId: auth.organizationId,
          action: { in: ['PERSONNEL_CREATED', 'PERSONNEL_UPDATED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED', 'PASSWORD_RESET', 'PERSONNEL_DELETED', 'BRANCH_REASSIGNED'] }
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { personnel: { select: { name: true, email: true } } }
      }),
      prisma.authorizedPersonnel.groupBy({
        by: ['disabled', 'isLocked'],
        where: baseWhere,
        _count: true,
      })
    ]);

    const summary = {
      total: statusCounts.reduce((acc, curr) => acc + curr._count, 0),
      active: statusCounts.find(c => !c.disabled && !c.isLocked)?._count ?? 0,
      disabled: statusCounts.find(c => c.disabled)?._count ?? 0,
      locked: statusCounts.find(c => c.isLocked)?._count ?? 0,
    };

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      summary,
      branchSummaries: branches.map(b => ({
        id: b.id,
        name: b.name,
        count: b._count.personnel
      })),
      recentLogs
    });
  } catch (error) {
    console.error("GET Personnel Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- POST: PROVISIONING -------------------- */

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !CAN_MANAGE_PERSONNEL.includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, password, branchId, role, isOrgOwner } = body;

    const cleanEmail = email.toLowerCase().trim();
    const assignedRole = (role as Role) || Role.CASHIER;
    
    // Default to the creator's branch if none is provided
    const assignedBranchId = branchId || auth.branchId || null;

    const hashedPassword = await bcrypt.hash(password, 12);

    const personnel = await prisma.$transaction(async (tx) => {
      // 1. Conflict Detection
      const conflict = await tx.authorizedPersonnel.findFirst({
        where: { email: cleanEmail, organizationId: auth.organizationId, deletedAt: null }
      });

      if (conflict) throw new Error("Email already registered.");

      // 2. Generate Staff Code
      const finalStaffCode = await generateStaffCode(tx, auth.organizationId, assignedBranchId, assignedRole);

      // 3. Create Personnel
      const created = await tx.authorizedPersonnel.create({
        data: {
          name: name.trim(),
          email: cleanEmail,
          password: hashedPassword,
          staffCode: finalStaffCode,
          role: assignedRole,
          organizationId: auth.organizationId,
          branchId: assignedBranchId,
          isOrgOwner: auth.isOrgOwner ? (isOrgOwner || false) : false,
          disabled: false,
          isLocked: false,
        },
      });

      // 4. Branch Assignment Pivot Entry
      if (assignedBranchId) {
        await tx.branchAssignment.create({
          data: {
            personnelId: created.id,
            branchId: assignedBranchId,
            role: created.role,
            isPrimary: true,
          }
        });
      }

      // 5. Activity Log
      await tx.activityLog.create({
        data: {
          organizationId: auth.organizationId,
          branchId: auth.branchId,
          personnelId: auth.userId,
          action: "PERSONNEL_CREATED",
          critical: true,
          metadata: {
            targetId: created.id,
            targetName: created.name || created.email,
            targetEmail: created.email,
            assignedRole: created.role,
            details: `Provisioned new account (${finalStaffCode})`
          } as Prisma.JsonObject
        }
      });

      return created;
    });

    return NextResponse.json(personnel, { status: 201 });
  } catch (error: any) {
    if (error.message === "Email already registered.") {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error("Provisioning Error:", error);
    return NextResponse.json({ message: "Provisioning failed" }, { status: 500 });
  }
}

/* -------------------- PATCH: IAM CONTROL -------------------- */

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !CAN_MANAGE_PERSONNEL.includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      id,
      name, email, role,
      disabled, isLocked, lockReason,
      newPassword,
      branchAssignments
    } = body;

    if (!id) return NextResponse.json({ message: "Target ID is required" }, { status: 400 });

    const targetUser = await prisma.authorizedPersonnel.findFirst({
      where: { id, organizationId: auth.organizationId, deletedAt: null }
    });

    if (!targetUser) return NextResponse.json({ message: "Personnel not found" }, { status: 404 });

    // --- SECURITY POLICY ENFORCEMENT ---
    const isTargetPrivileged = targetUser.role === Role.ADMIN || targetUser.isOrgOwner;

    // 1. Protect Admins & Owners from lockout/disable
    if (isTargetPrivileged && (disabled === true || isLocked === true)) {
      return NextResponse.json({ message: "Privileged accounts cannot be locked or disabled." }, { status: 403 });
    }

    // 2. Manager Restrictions
    if (auth.role === Role.MANAGER) {
      if (isTargetPrivileged) {
        return NextResponse.json({ message: "Cannot modify superior roles." }, { status: 403 });
      }
      if (targetUser.id === auth.userId && (disabled !== undefined || isLocked !== undefined)) {
        return NextResponse.json({ message: "Managers cannot modify their own security status." }, { status: 403 });
      }
      if (disabled !== undefined) {
        return NextResponse.json({ message: "Managers are not authorized to disable accounts." }, { status: 403 });
      }
    }

    const cleanEmail = email?.toLowerCase().trim();

    const updatedPersonnel = await prisma.$transaction(async (tx) => {
      // 3. Email Conflict Check (if email is changing)
      if (cleanEmail && cleanEmail !== targetUser.email) {
        const conflict = await tx.authorizedPersonnel.findFirst({
          where: { email: cleanEmail, organizationId: auth.organizationId, id: { not: id }, deletedAt: null }
        });
        if (conflict) throw new Error("Email already in use.");
      }

      const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
      const auditChanges: Record<string, any> = {};
      const actions: string[] = [];
      let notificationMessage: string | null = null;

      // Profile updates
      if (name !== undefined && name.trim() !== targetUser.name) {
        updateData.name = name.trim();
        auditChanges.name = { from: targetUser.name, to: name.trim() };
      }
      if (cleanEmail !== undefined && cleanEmail !== targetUser.email) {
        updateData.email = cleanEmail;
        auditChanges.email = { from: targetUser.email, to: cleanEmail };
      }
      if (role !== undefined && role !== targetUser.role) {
        updateData.role = role;
        auditChanges.role = { from: targetUser.role, to: role };
      }

      // Security Toggles
      if (disabled !== undefined && disabled !== targetUser.disabled) {
        updateData.disabled = disabled;
        auditChanges.disabled = { from: targetUser.disabled, to: disabled };
        actions.push(disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED");
        notificationMessage = disabled ? "Your account has been disabled." : "Your account access has been restored.";
      }

      if (isLocked !== undefined && isLocked !== targetUser.isLocked) {
        updateData.isLocked = isLocked;
        updateData.lockReason = isLocked ? (lockReason || "Administratively locked") : null;
        auditChanges.isLocked = { from: targetUser.isLocked, to: isLocked };
        
        if (!isLocked) {
          updateData.failedLoginAttempts = 0;
          updateData.lockoutUntil = null;
        }
        actions.push(isLocked ? "ACCOUNT_LOCKED" : "ACCOUNT_UNLOCKED");
        if (!notificationMessage) { // Prioritize disable message if both happen
           notificationMessage = isLocked ? `Your account has been locked. Reason: ${updateData.lockReason}` : "Your account has been unlocked.";
        }
      }

      if (newPassword) {
        updateData.password = await bcrypt.hash(newPassword, 12);
        auditChanges.password = "Reset by Admin";
        actions.push("PASSWORD_RESET");
      }

      // Multi-Branch Assignment Sync
      let branchesReassigned = false;
      if (branchAssignments && Array.isArray(branchAssignments)) {
        await tx.branchAssignment.deleteMany({ where: { personnelId: id } });

        if (branchAssignments.length > 0) {
          const primaryCount = branchAssignments.filter(ba => ba.isPrimary).length;
          if (primaryCount > 1) throw new Error("Only one branch can be marked as primary.");
          if (primaryCount === 0) branchAssignments[0].isPrimary = true;

          await tx.branchAssignment.createMany({
            data: branchAssignments.map(ba => ({
              personnelId: id,
              branchId: ba.branchId,
              role: ba.role || targetUser.role,
              isPrimary: ba.isPrimary
            }))
          });

          const primaryBranch = branchAssignments.find(ba => ba.isPrimary);
          updateData.branchId = primaryBranch ? primaryBranch.branchId : null;
          branchesReassigned = true;
          actions.push("BRANCH_REASSIGNED");
        } else {
          updateData.branchId = null;
          branchesReassigned = true;
        }
      }

      if (Object.keys(auditChanges).filter(k => !['isLocked', 'disabled', 'password'].includes(k)).length > 0 && !actions.includes("PERSONNEL_UPDATED")) {
        actions.push("PERSONNEL_UPDATED");
      }

      // Execute main update
      const updated = await tx.authorizedPersonnel.update({
        where: { id },
        data: updateData,
        include: {
          branchAssignments: { include: { branch: { select: { name: true } } } }
        }
      });

      // Trigger Notification if security status changed
      if (notificationMessage) {
        await tx.notification.create({
          data: {
            organizationId: auth.organizationId,
            branchId: targetUser.branchId,
            type: NotificationType.SYSTEM,
            title: "Security Status Update",
            message: notificationMessage,
            recipients: {
              create: { personnelId: targetUser.id }
            }
          }
        });
      }

      // Comprehensive Activity Log Insert
      if (actions.length > 0) {
        await tx.activityLog.create({
          data: {
            organizationId: auth.organizationId,
            branchId: auth.branchId,
            personnelId: auth.userId,
            action: actions.join(" | "),
            critical: actions.some(a => ["PASSWORD_RESET", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED"].includes(a)),
            metadata: {
              targetId: id,
              targetName: updated.name || updated.email,
              targetEmail: updated.email,
              changes: auditChanges,
              details: `Updates applied: ${Object.keys(auditChanges).join(', ')}${branchesReassigned ? ' + Branches' : ''}`
            } as Prisma.JsonObject
          }
        });
      }

      return updated;
    });

    return NextResponse.json(updatedPersonnel, { status: 200 });
  } catch (error: any) {
    console.error("PATCH Personnel Error:", error);
    if (["Email already in use.", "Only one branch can be marked as primary."].includes(error.message)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Failed to update personnel" }, { status: 500 });
  }
}

/* -------------------- DELETE: SOFT DEACTIVATION -------------------- */

export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth || !CAN_MANAGE_PERSONNEL.includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ message: "ID required" }, { status: 400 });

    if (id === auth.userId) {
      return NextResponse.json({ message: "Cannot delete your own account" }, { status: 400 });
    }

    const targetUser = await prisma.authorizedPersonnel.findUnique({
      where: { id, organizationId: auth.organizationId, deletedAt: null }
    });

    if (!targetUser) return NextResponse.json({ message: "User not found" }, { status: 404 });

    // IAM Safeguards for Deletion
    if (targetUser.role === Role.ADMIN || targetUser.isOrgOwner) {
       return NextResponse.json({ message: "Privileged accounts cannot be deleted." }, { status: 403 });
    }
    if (auth.role === Role.MANAGER) {
       return NextResponse.json({ message: "Managers are not authorized to delete accounts." }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.authorizedPersonnel.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          disabled: true,
          isLocked: true,
          lockReason: "Account deactivated/deleted"
        },
      });

      // Notify User
      await tx.notification.create({
        data: {
          organizationId: auth.organizationId,
          type: NotificationType.SYSTEM,
          title: "Account Deactivated",
          message: "Your account has been permanently deactivated by an administrator.",
          recipients: { create: { personnelId: targetUser.id } }
        }
      });

      // Audit Log
      await tx.activityLog.create({
        data: {
          organizationId: auth.organizationId,
          branchId: auth.branchId,
          personnelId: auth.userId,
          action: "PERSONNEL_DELETED",
          critical: true,
          metadata: {
            targetId: id,
            targetName: targetUser.name || targetUser.email,
            targetEmail: targetUser.email,
            details: `Account softly deleted and locked.`
          } as Prisma.JsonObject
        }
      });
    });

    return NextResponse.json({ message: "Personnel deactivated successfully" });
  } catch (error) {
    console.error("DELETE Personnel Error:", error);
    return NextResponse.json({ message: "Deletion failed" }, { status: 500 });
  }
}