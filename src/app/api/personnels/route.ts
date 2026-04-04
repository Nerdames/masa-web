import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma"; 
import { 
  Prisma, 
  Role, 
  NotificationType, 
  Severity, 
  ActorType,
  CriticalAction 
} from "@prisma/client";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { 
  validateManagementRights, 
  canPerformAction,
  ManagementAction
} from "@/core/lib/permission"; // Adjust path to your permission file

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/* -------------------- HELPERS -------------------- */

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

const ROLE_CODE: Record<Role, string> = {
  DEV: "00",
  ADMIN: "01",
  MANAGER: "02",
  AUDITOR: "03",
  INVENTORY: "04",
  SALES: "05",
  CASHIER: "06",
};

async function generateStaffCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
  role: Role
) {
  const count = await tx.authorizedPersonnel.count({ where: { organizationId } });
  const nn = (count + 1).toString().padStart(3, "0");
  const rr = ROLE_CODE[role] || "99";
  return `STF-${nn}-${rr}`;
}

// Generates a secure temporary password if none is provided
function generateTempPassword(): string {
  return crypto.randomBytes(5).toString("hex") + "X1@"; // e.g., 9f2b3c4d5eX1@
}

/* -------------------- GET: LIST, ANALYTICS & PREFERENCES -------------------- */

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  if (![Role.DEV, Role.ADMIN, Role.MANAGER].includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 10), 1), 100);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status");

    const baseWhere: Prisma.AuthorizedPersonnelWhereInput = {
      deletedAt: null,
      organizationId: auth.organizationId,
      // Managers only see personnel assigned to their branch (unless OrgOwner)
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

    const [total, data, branches, statusCounts] = await Promise.all([
      prisma.authorizedPersonnel.count({ where: paginationWhere }),
      prisma.authorizedPersonnel.findMany({
        where: paginationWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          staffCode: true,
          role: true,
          disabled: true,
          isLocked: true,
          lastLogin: true,
          lastActivityAt: true,
          createdAt: true,
          branch: { select: { id: true, name: true } },
          branchAssignments: { include: { branch: { select: { id: true, name: true } } } },
          // Fetching preferences attached to the personnel
          preferences: true 
        }
      }),
      prisma.branch.findMany({
        where: { organizationId: auth.organizationId, deletedAt: null },
        select: { id: true, name: true, _count: { select: { personnel: true } } }
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
      disabled: statusCounts.filter(c => c.disabled).reduce((acc, curr) => acc + curr._count, 0),
      locked: statusCounts.filter(c => c.isLocked).reduce((acc, curr) => acc + curr._count, 0),
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
    });
  } catch (error) {
    console.error("GET Personnel Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/* -------------------- POST: PROVISIONING (W/ TEMP CREDENTIALS) -------------------- */

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);

  if (!auth || (!auth.isOrgOwner && auth.role !== Role.ADMIN && auth.role !== Role.DEV)) {
    return NextResponse.json({ message: "You do not have clearance to provision new personnel." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, password, branchId, role, isOrgOwner, preferences } = body;

    const cleanEmail = email.toLowerCase().trim();
    const assignedRole = (role as Role) || Role.CASHIER;
    const assignedBranchId = branchId || auth.branchId || null;

    // Logic: Temp Credential Generation
    const isTempCredential = !password || password.trim() === "";
    const plainPassword = isTempCredential ? generateTempPassword() : password;
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    const personnel = await prisma.$transaction(async (tx) => {
      const conflict = await tx.authorizedPersonnel.findFirst({
        where: { email: cleanEmail, organizationId: auth.organizationId, deletedAt: null }
      });

      if (conflict) throw new Error("Email already registered in this organization.");

      const finalStaffCode = await generateStaffCode(tx, auth.organizationId, assignedRole);

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
          requiresPasswordChange: true, // Forces change on first login
          ...(preferences && { preferences: { create: preferences } })
        },
      });

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

      await tx.activityLog.create({
        data: {
          organizationId: auth.organizationId,
          branchId: auth.branchId,
          actorId: auth.userId,
          actorType: ActorType.USER,
          actorRole: auth.role,
          action: "PERSONNEL_CREATED",
          severity: Severity.MEDIUM,
          targetId: created.id,
          targetType: "PERSONNEL",
          after: { email: created.email, role: created.role, branchId: assignedBranchId } as Prisma.InputJsonObject,
          metadata: { 
            details: `Provisioned account (${finalStaffCode}). Force reset enabled.`,
            isTempCredential 
          } as Prisma.InputJsonObject
        }
      });

      return created;
    });

    // Exclude the hashed password, but securely return the temporary credential ONCE for the admin
    const { password: _, ...safePersonnel } = personnel;
    
    return NextResponse.json({
      ...safePersonnel,
      tempPassword: isTempCredential ? plainPassword : null, // Surface this to the frontend Admin UI
      message: isTempCredential ? "Personnel created with temporary credentials." : "Personnel created successfully."
    }, { status: 201 });

  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: "A user with this email or staff code already exists." }, { status: 409 });
    }
    return NextResponse.json({ message: error.message || "Provisioning failed" }, { status: 400 });
  }
}

/* -------------------- PATCH: IAM CONTROL -------------------- */

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      id, name, email, role, disabled, isLocked, lockReason, newPassword, branchAssignments, preferences
    } = body;

    if (!id) return NextResponse.json({ message: "Personnel ID is required" }, { status: 400 });

    const targetUser = await prisma.authorizedPersonnel.findUnique({
      where: { id, organizationId: auth.organizationId, deletedAt: null }
    });

    if (!targetUser) return NextResponse.json({ message: "Personnel not found" }, { status: 404 });

    // Determine highest-level action for management validation
    let managementAction: ManagementAction = "UPDATE_STATUS";
    if (newPassword) managementAction = "RESET_PASSWORD";
    else if (role !== undefined && role !== targetUser.role) managementAction = "UPDATE_ROLE";
    else if (branchAssignments) managementAction = "TRANSFER_BRANCH";

    // Unified Management Rights Check
    const rights = validateManagementRights(auth, targetUser, managementAction);
    if (!rights.authorized) {
      return NextResponse.json({ message: rights.reason }, { status: 403 });
    }

    // Critical Action Capability Checks
    if (newPassword && !canPerformAction(auth.role, "PASSWORD_CHANGE")) {
      return NextResponse.json({ message: "Admin elevation required for password resets." }, { status: 403 });
    }
    if (email && email.toLowerCase().trim() !== targetUser.email && !canPerformAction(auth.role, "EMAIL_CHANGE")) {
      return NextResponse.json({ message: "Admin elevation required for email modifications." }, { status: 403 });
    }

    const cleanEmail = email?.toLowerCase().trim();

    const updatedPersonnel = await prisma.$transaction(async (tx) => {
      if (cleanEmail && cleanEmail !== targetUser.email) {
        const conflict = await tx.authorizedPersonnel.findFirst({
          where: { email: cleanEmail, organizationId: auth.organizationId, id: { not: id }, deletedAt: null }
        });
        if (conflict) throw new Error("Email already in use in this organization.");
      }

      const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
      const actions: string[] = [];
      let severity: Severity = Severity.LOW;
      let notificationMessage: string | null = null;
      let criticalActionTrigger: CriticalAction | undefined = undefined;

      // Extract Before State for Audit
      const beforeState: any = {
         name: targetUser.name, email: targetUser.email, role: targetUser.role,
         disabled: targetUser.disabled, isLocked: targetUser.isLocked, branchId: targetUser.branchId
      };
      const afterState: any = { ...beforeState };

      // Field Updates
      if (name !== undefined && name.trim() !== targetUser.name) {
        updateData.name = name.trim();
        afterState.name = name.trim();
      }
      if (cleanEmail !== undefined && cleanEmail !== targetUser.email) {
        updateData.email = cleanEmail;
        afterState.email = cleanEmail;
        criticalActionTrigger = CriticalAction.EMAIL_CHANGE;
      }
      if (role !== undefined && role !== targetUser.role) {
        updateData.role = role;
        afterState.role = role;
        severity = Severity.HIGH;
      }
      if (preferences) {
        // Upsert logic for preferences
        updateData.preferences = { upsert: { create: preferences, update: preferences } };
        actions.push("PREFERENCES_UPDATED");
      }
      
      // Security Controls
      if (disabled !== undefined && disabled !== targetUser.disabled) {
        updateData.disabled = disabled;
        afterState.disabled = disabled;
        actions.push(disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED");
        severity = Severity.HIGH;
        notificationMessage = disabled ? "Your account has been disabled by management." : "Your account access has been restored.";
      }

      if (isLocked !== undefined && isLocked !== targetUser.isLocked) {
        updateData.isLocked = isLocked;
        updateData.lockReason = isLocked ? (lockReason || "Administratively locked") : null;
        afterState.isLocked = isLocked;
        if (!isLocked) {
          updateData.failedLoginAttempts = 0;
          updateData.lockoutUntil = null;
        }
        actions.push(isLocked ? "ACCOUNT_LOCKED" : "ACCOUNT_UNLOCKED");
        criticalActionTrigger = CriticalAction.USER_LOCK_UNLOCK;
        severity = Severity.HIGH;
        if (!notificationMessage) {
           notificationMessage = isLocked ? `Account locked: ${updateData.lockReason}` : "Account unlocked.";
        }
      }

      // Handle Forced Password Resets
      if (newPassword) {
        updateData.password = await bcrypt.hash(newPassword, 12);
        updateData.requiresPasswordChange = true; 
        actions.push("PASSWORD_RESET");
        criticalActionTrigger = CriticalAction.PASSWORD_CHANGE;
        severity = Severity.HIGH;
        notificationMessage = "Your password has been reset by an administrator. You will be required to change it upon your next login.";
      }

      // Branch Reassignment logic
      if (branchAssignments && Array.isArray(branchAssignments)) {
        await tx.branchAssignment.deleteMany({ where: { personnelId: id } });
        if (branchAssignments.length > 0) {
          const primaryCount = branchAssignments.filter((ba: any) => ba.isPrimary).length;
          if (primaryCount > 1) throw new Error("Only one branch can be marked as primary.");
          if (primaryCount === 0) branchAssignments[0].isPrimary = true;

          await tx.branchAssignment.createMany({
            data: branchAssignments.map((ba: any) => ({
              personnelId: id,
              branchId: ba.branchId,
              role: ba.role || targetUser.role,
              isPrimary: ba.isPrimary
            }))
          });

          const primaryBranch = branchAssignments.find((ba: any) => ba.isPrimary);
          updateData.branchId = primaryBranch ? primaryBranch.branchId : null;
          afterState.branchId = updateData.branchId;
          actions.push("BRANCH_REASSIGNED");
          severity = Severity.MEDIUM;
        } else {
          updateData.branchId = null;
          afterState.branchId = null;
        }
      }

      if (actions.length === 0 && Object.keys(updateData).length > 0) {
        actions.push("PERSONNEL_UPDATED");
      }

      const updated = await tx.authorizedPersonnel.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, email: true, role: true, disabled: true, isLocked: true, branchId: true }
      });

      // Unified Notification System mapping
      if (notificationMessage) {
        await tx.notification.create({
          data: {
            organizationId: auth.organizationId,
            branchId: targetUser.branchId,
            type: NotificationType.SECURITY,
            actionTrigger: criticalActionTrigger,
            title: "Important Security Update",
            message: notificationMessage,
            recipients: { create: { personnelId: targetUser.id } } 
          }
        });
      }

      // Forensic Auditing
      if (actions.length > 0) {
        await tx.activityLog.create({
          data: {
            organizationId: auth.organizationId,
            branchId: auth.branchId,
            actorId: auth.userId,
            actorType: ActorType.USER,
            actorRole: auth.role,
            action: actions.join(" | "),
            severity,
            critical: severity === Severity.HIGH || severity === Severity.CRITICAL,
            targetId: id,
            targetType: "PERSONNEL",
            before: beforeState as Prisma.InputJsonObject,
            after: afterState as Prisma.InputJsonObject,
            metadata: { updates: Object.keys(updateData) } as Prisma.InputJsonObject
          }
        });
      }

      return updated;
    });

    return NextResponse.json(updatedPersonnel, { status: 200 });
  } catch (error: any) {
    console.error("PATCH Personnel Error:", error);
    return NextResponse.json({ message: error.message || "Update failed" }, { status: 400 });
  }
}

/* -------------------- DELETE: SOFT DEACTIVATION -------------------- */

export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ message: "Personnel ID required" }, { status: 400 });

    const targetUser = await prisma.authorizedPersonnel.findUnique({
      where: { id, organizationId: auth.organizationId, deletedAt: null }
    });

    if (!targetUser) return NextResponse.json({ message: "Personnel not found" }, { status: 404 });

    // Validate using the new action-aware permission rule
    const rights = validateManagementRights(auth, targetUser, "DELETE");
    if (!rights.authorized) {
       return NextResponse.json({ message: rights.reason }, { status: 403 });
    }

    // Secondary strict validation as fallback
    if (!auth.isOrgOwner && auth.role !== Role.ADMIN && auth.role !== Role.DEV) {
      return NextResponse.json({ message: "Account deactivation requires Admin clearance." }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.authorizedPersonnel.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          disabled: true,
          isLocked: true,
          lockReason: "Account deactivated/archived by administrator"
        },
      });

      await tx.notification.create({
        data: {
          organizationId: auth.organizationId,
          type: NotificationType.SECURITY,
          actionTrigger: CriticalAction.USER_LOCK_UNLOCK,
          title: "Account Deactivated",
          message: "Your account has been permanently deactivated by management.",
          recipients: { create: { personnelId: targetUser.id } }
        }
      });

      await tx.activityLog.create({
        data: {
          organizationId: auth.organizationId,
          branchId: auth.branchId,
          actorId: auth.userId,
          actorType: ActorType.USER,
          actorRole: auth.role,
          action: "PERSONNEL_DELETED",
          severity: Severity.CRITICAL,
          critical: true,
          targetId: id,
          targetType: "PERSONNEL",
          before: { status: "ACTIVE", lockReason: targetUser.lockReason } as Prisma.InputJsonObject,
          after: { status: "DELETED", lockReason: "Account deactivated/archived by administrator" } as Prisma.InputJsonObject,
          metadata: { details: `Account securely archived.` } as Prisma.InputJsonObject
        }
      });
    });

    return NextResponse.json({ message: "Personnel deactivated successfully" });
  } catch (error) {
    console.error("DELETE Personnel Error:", error);
    return NextResponse.json({ message: "Deletion failed" }, { status: 500 });
  }
}