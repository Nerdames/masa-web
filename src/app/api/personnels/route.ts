/**
 * src/app/api/personnel/route.ts
 * PERSONNEL MANAGEMENT API (V2.6 - FORTIFIED)
 * Optimized for: Enterprise Security, RBAC Compliance, Forensic Auditing, and Strict Branch Isolation.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import {
  Prisma,
  Role,
  NotificationType,
  Severity,
  CriticalAction,
  Resource,
} from "@prisma/client";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import {
  validateManagementRights,
  canPerformAction,
  ManagementAction,
} from "@/core/lib/permission";
import { createAuditLog } from "@/core/lib/audit";

const JWT_SECRET = process.env.NEXTAUTH_SECRET;

/* -------------------- VALIDATION SCHEMAS -------------------- */

const ProvisionSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.string().email("Invalid email format").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
  branchId: z.string().cuid("Invalid Branch ID format").optional().nullable(),
  role: z.nativeEnum(Role).optional().default(Role.CASHIER),
  isOrgOwner: z.boolean().optional().default(false),
  preferences: z.record(z.any()).optional(),
});

const UpdatePersonnelSchema = z.object({
  id: z.string().cuid("Invalid Personnel ID"),
  name: z.string().min(2).trim().optional(),
  email: z.string().email().trim().toLowerCase().optional(),
  role: z.nativeEnum(Role).optional(),
  disabled: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  lockReason: z.string().optional().nullable(),
  newPassword: z.string().min(8).optional(),
  branchAssignments: z
    .array(
      z.object({
        branchId: z.string().cuid(),
        role: z.nativeEnum(Role).optional(),
        isPrimary: z.boolean().default(false),
      })
    )
    .optional(),
  preferences: z.record(z.any()).optional(),
});

/* -------------------- CORE HELPERS -------------------- */

async function getAuthContext(req: NextRequest) {
  const token = await getToken({ req, secret: JWT_SECRET });
  if (!token || typeof token.id !== "string" || token.expired) return null;

  return {
    userId: token.id,
    role: (token.role as Role) || Role.CASHIER,
    organizationId: token.organizationId as string,
    branchId: (token.branchId as string) ?? null,
    isOrgOwner: !!token.isOrgOwner,
    ipAddress: req.headers.get("x-forwarded-for") || "UNKNOWN",
    deviceInfo: req.headers.get("user-agent") || "UNKNOWN",
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
  const count = await tx.authorizedPersonnel.count({
    where: { organizationId },
  });
  const nn = (count + 1).toString().padStart(3, "0");
  const rr = ROLE_CODE[role] || "99";
  return `STF-${nn}-${rr}`;
}

function generateTempPassword(): string {
  return crypto.randomBytes(6).toString("hex") + "X1@";
}

/* -------------------- HTTP METHODS -------------------- */

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  // Baseline RBAC guard
  if (![Role.DEV, Role.ADMIN, Role.MANAGER, Role.AUDITOR].includes(auth.role)) {
    return NextResponse.json({ message: "Access denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page") ?? 1), 1);
    const pageSize = Math.min(
      Math.max(Number(searchParams.get("pageSize") ?? 10), 1),
      100
    );
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status");

    // Strictly scopes personnel to the active branch in the session for ALL users.
    // auth.ts handles seamless branch switching for super users.
    const baseWhere: Prisma.AuthorizedPersonnelWhereInput = {
      deletedAt: null,
      organizationId: auth.organizationId,
      ...(auth.branchId && {
        branchAssignments: { some: { branchId: auth.branchId } },
      }),
    };

    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { staffCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const paginationWhere: Prisma.AuthorizedPersonnelWhereInput = {
      ...baseWhere,
    };
    
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
          branchAssignments: {
            include: { branch: { select: { id: true, name: true } } },
          },
          preferences: true,
        },
      }),
      prisma.branch.findMany({
        where: { organizationId: auth.organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          _count: { select: { personnel: true } },
        },
      }),
      prisma.authorizedPersonnel.groupBy({
        by: ["disabled", "isLocked"],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const summary = {
      total: statusCounts.reduce((acc, curr) => acc + curr._count, 0),
      active:
        statusCounts.find((c) => !c.disabled && !c.isLocked)?._count ?? 0,
      disabled: statusCounts
        .filter((c) => c.disabled)
        .reduce((acc, curr) => acc + curr._count, 0),
      locked: statusCounts
        .filter((c) => c.isLocked)
        .reduce((acc, curr) => acc + curr._count, 0),
    };

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      summary,
      branchSummaries: branches.map((b) => ({
        id: b.id,
        name: b.name,
        count: b._count.personnel,
      })),
    });
  } catch (error) {
    console.error("GET Personnel Error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (
    !auth ||
    (!auth.isOrgOwner && auth.role !== Role.ADMIN && auth.role !== Role.DEV)
  ) {
    return NextResponse.json(
      { message: "Clearance level insufficient to provision personnel." },
      { status: 403 }
    );
  }

  const requestId = crypto.randomUUID();

  try {
    const rawBody = await req.json();
    const parsed = ProvisionSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation failed", errors: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      password,
      branchId,
      role,
      isOrgOwner,
      preferences,
    } = parsed.data;

    const assignedRole = role as Role;
    const assignedBranchId = branchId || auth.branchId || null;

    const isTempCredential = !password || password.trim() === "";
    const plainPassword = isTempCredential
      ? generateTempPassword()
      : password!;
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    const personnel = await prisma.$transaction(async (tx) => {
      const conflict = await tx.authorizedPersonnel.findFirst({
        where: { email, organizationId: auth.organizationId, deletedAt: null },
      });

      if (conflict)
        throw new Error("Email already registered in this organization.");

      const finalStaffCode = await generateStaffCode(
        tx,
        auth.organizationId,
        assignedRole
      );

      const created = await tx.authorizedPersonnel.create({
        data: {
          name,
          email,
          password: hashedPassword,
          staffCode: finalStaffCode,
          role: assignedRole,
          organizationId: auth.organizationId,
          branchId: assignedBranchId,
          // Only OrgOwners can provision new OrgOwners
          isOrgOwner: auth.isOrgOwner ? isOrgOwner : false,
          disabled: false,
          isLocked: false,
          requiresPasswordChange: true, // Always enforce a reset on first login
          ...(preferences && { preferences: { create: preferences } }),
        },
      });

      if (assignedBranchId) {
        await tx.branchAssignment.create({
          data: {
            personnelId: created.id,
            branchId: assignedBranchId,
            role: created.role,
            isPrimary: true,
          },
        });
      }

      // 🛡️ Forensic Logging via audit.ts
      await createAuditLog(tx as any, {
        action: "PERSONNEL_CREATED",
        resource: Resource.PERSONNEL,
        resourceId: created.id,
        organizationId: auth.organizationId,
        branchId: auth.branchId,
        actorId: auth.userId,
        actorRole: auth.role,
        severity: Severity.MEDIUM,
        description: `Provisioned account (${finalStaffCode}). Force reset enabled.`,
        changes: {
          to: {
            email: created.email,
            role: created.role,
            branchId: assignedBranchId,
          },
        },
        ipAddress: auth.ipAddress,
        deviceInfo: auth.deviceInfo,
        requestId,
        metadata: { isTempCredential },
      });

      return created;
    });

    const { password: _, ...safePersonnel } = personnel;

    return NextResponse.json(
      {
        ...safePersonnel,
        tempPassword: isTempCredential ? plainPassword : null,
        message: isTempCredential
          ? "Personnel created with temporary credentials."
          : "Personnel created successfully.",
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "A user with this email or staff code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: error.message || "Provisioning failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const requestId = crypto.randomUUID();

  try {
    const rawBody = await req.json();
    const parsed = UpdatePersonnelSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation failed", errors: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      id,
      name,
      email,
      role,
      disabled,
      isLocked,
      lockReason,
      newPassword,
      branchAssignments,
      preferences,
    } = parsed.data;

    // Strict branch isolation: Ensure the target user belongs to the active session's branch
    const targetUser = await prisma.authorizedPersonnel.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        deletedAt: null,
        ...(auth.branchId && {
          branchAssignments: { some: { branchId: auth.branchId } },
        }),
      },
    });

    if (!targetUser)
      return NextResponse.json(
        { message: "Personnel not found in the current active branch" },
        { status: 404 }
      );

    let managementAction: ManagementAction = "UPDATE_STATUS";
    if (newPassword) managementAction = "RESET_PASSWORD";
    else if (role !== undefined && role !== targetUser.role)
      managementAction = "UPDATE_ROLE";
    else if (branchAssignments) managementAction = "TRANSFER_BRANCH";

    const rights = validateManagementRights(auth, targetUser as any, managementAction);
    if (!rights.authorized) {
      return NextResponse.json({ message: rights.reason }, { status: 403 });
    }

    if (newPassword && !canPerformAction(auth.role, "PASSWORD_CHANGE")) {
      return NextResponse.json(
        { message: "Admin elevation required for password resets." },
        { status: 403 }
      );
    }
    if (
      email &&
      email !== targetUser.email &&
      !canPerformAction(auth.role, "EMAIL_CHANGE")
    ) {
      return NextResponse.json(
        { message: "Admin elevation required for email modifications." },
        { status: 403 }
      );
    }

    const updatedPersonnel = await prisma.$transaction(async (tx) => {
      if (email && email !== targetUser.email) {
        const conflict = await tx.authorizedPersonnel.findFirst({
          where: {
            email,
            organizationId: auth.organizationId,
            id: { not: id },
            deletedAt: null,
          },
        });
        if (conflict) throw new Error("Email already in use in this organization.");
      }

      const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
      const actions: string[] = [];
      let severity: Severity = Severity.LOW;
      let notificationMessage: string | null = null;
      let criticalActionTrigger: CriticalAction | undefined = undefined;

      const beforeState: any = {
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        disabled: targetUser.disabled,
        isLocked: targetUser.isLocked,
        branchId: targetUser.branchId,
      };
      const afterState: any = { ...beforeState };

      if (name !== undefined && name !== targetUser.name) {
        updateData.name = name;
        afterState.name = name;
      }
      if (email !== undefined && email !== targetUser.email) {
        updateData.email = email;
        afterState.email = email;
        criticalActionTrigger = CriticalAction.EMAIL_CHANGE;
      }
      if (role !== undefined && role !== targetUser.role) {
        updateData.role = role;
        afterState.role = role;
        severity = Severity.HIGH;
      }
      if (preferences) {
        updateData.preferences = {
          upsert: { create: preferences, update: preferences },
        };
        actions.push("PREFERENCES_UPDATED");
      }

      if (disabled !== undefined && disabled !== targetUser.disabled) {
        updateData.disabled = disabled;
        afterState.disabled = disabled;
        actions.push(disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED");
        severity = Severity.HIGH;
        notificationMessage = disabled
          ? "Your account has been disabled by management."
          : "Your account access has been restored.";
      }

      if (isLocked !== undefined && isLocked !== targetUser.isLocked) {
        updateData.isLocked = isLocked;
        updateData.lockReason = isLocked
          ? lockReason || "Administratively locked"
          : null;
        afterState.isLocked = isLocked;
        if (!isLocked) {
          updateData.failedLoginAttempts = 0;
          updateData.lockoutUntil = null;
        }
        actions.push(isLocked ? "ACCOUNT_LOCKED" : "ACCOUNT_UNLOCKED");
        criticalActionTrigger = CriticalAction.USER_LOCK_UNLOCK;
        severity = Severity.HIGH;
        if (!notificationMessage) {
          notificationMessage = isLocked
            ? `Account locked: ${updateData.lockReason}`
            : "Account unlocked.";
        }
      }

      if (newPassword) {
        updateData.password = await bcrypt.hash(newPassword, 12);
        updateData.requiresPasswordChange = true;
        actions.push("PASSWORD_RESET");
        criticalActionTrigger = CriticalAction.PASSWORD_CHANGE;
        severity = Severity.HIGH;
        notificationMessage =
          "Your password has been reset by an administrator. You will be required to change it upon your next login.";
      }

      if (branchAssignments && Array.isArray(branchAssignments)) {
        await tx.branchAssignment.deleteMany({ where: { personnelId: id } });
        if (branchAssignments.length > 0) {
          const primaryCount = branchAssignments.filter((ba) => ba.isPrimary)
            .length;
          if (primaryCount > 1)
            throw new Error("Only one branch can be marked as primary.");
          if (primaryCount === 0) branchAssignments[0].isPrimary = true;

          await tx.branchAssignment.createMany({
            data: branchAssignments.map((ba) => ({
              personnelId: id,
              branchId: ba.branchId,
              role: ba.role || targetUser.role,
              isPrimary: ba.isPrimary,
            })),
          });

          const primaryBranch = branchAssignments.find((ba) => ba.isPrimary);
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
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabled: true,
          isLocked: true,
          branchId: true,
        },
      });

      if (notificationMessage) {
        await tx.notification.create({
          data: {
            organizationId: auth.organizationId,
            branchId: targetUser.branchId,
            type: NotificationType.SECURITY,
            actionTrigger: criticalActionTrigger,
            title: "Important Security Update",
            message: notificationMessage,
            recipients: { create: { personnelId: targetUser.id } },
          },
        });
      }

      if (actions.length > 0) {
        // 🛡️ Forensic Logging via audit.ts
        await createAuditLog(tx as any, {
          action: actions.join(" | "),
          resource: Resource.PERSONNEL,
          resourceId: id,
          organizationId: auth.organizationId,
          branchId: auth.branchId,
          actorId: auth.userId,
          actorRole: auth.role,
          severity,
          description: `Updated personnel record: ${updated.email}`,
          changes: { from: beforeState, to: afterState },
          ipAddress: auth.ipAddress,
          deviceInfo: auth.deviceInfo,
          requestId,
          actionTrigger: criticalActionTrigger,
          metadata: { updates: Object.keys(updateData) },
        });
      }

      return updated;
    });

    return NextResponse.json(updatedPersonnel, { status: 200 });
  } catch (error: any) {
    console.error("PATCH Personnel Error:", error);
    return NextResponse.json(
      { message: error.message || "Update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const requestId = crypto.randomUUID();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id)
      return NextResponse.json(
        { message: "Personnel ID required" },
        { status: 400 }
      );

    // Strict branch isolation: Ensure target user belongs to the active session's branch
    const targetUser = await prisma.authorizedPersonnel.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        deletedAt: null,
        ...(auth.branchId && {
          branchAssignments: { some: { branchId: auth.branchId } },
        }),
      },
    });

    if (!targetUser)
      return NextResponse.json(
        { message: "Personnel not found in the current active branch" },
        { status: 404 }
      );

    const rights = validateManagementRights(auth, targetUser as any, "DELETE");
    if (!rights.authorized) {
      return NextResponse.json({ message: rights.reason }, { status: 403 });
    }

    if (!auth.isOrgOwner && auth.role !== Role.ADMIN && auth.role !== Role.DEV) {
      return NextResponse.json(
        { message: "Account deactivation requires Admin clearance." },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Soft-delete and hard lock the personnel record
      await tx.authorizedPersonnel.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          disabled: true,
          isLocked: true,
          lockReason: "Account deactivated/archived by administrator",
        },
      });

      // 2. Remove primary session/assignments if necessary to clear active views
      await tx.branchAssignment.deleteMany({
        where: { personnelId: id },
      });

      // 3. Dispatch Notification
      await tx.notification.create({
        data: {
          organizationId: auth.organizationId,
          type: NotificationType.SECURITY,
          actionTrigger: CriticalAction.USER_LOCK_UNLOCK,
          title: "Account Deactivated",
          message:
            "Your account has been permanently deactivated by management.",
          recipients: { create: { personnelId: targetUser.id } },
        },
      });

      // 4. 🛡️ Forensic Logging via audit.ts
      await createAuditLog(tx as any, {
        action: "PERSONNEL_DELETED",
        resource: Resource.PERSONNEL,
        resourceId: id,
        organizationId: auth.organizationId,
        branchId: auth.branchId,
        actorId: auth.userId,
        actorRole: auth.role,
        severity: Severity.CRITICAL,
        critical: true,
        description: "Soft-deleted / Archived user account",
        changes: {
          from: { status: "ACTIVE", lockReason: targetUser.lockReason },
          to: {
            status: "DELETED",
            lockReason: "Account deactivated/archived by administrator",
          },
        },
        ipAddress: auth.ipAddress,
        deviceInfo: auth.deviceInfo,
        requestId,
        actionTrigger: CriticalAction.USER_LOCK_UNLOCK,
        metadata: { details: `Account securely archived.` },
      });
    });

    return NextResponse.json({ message: "Personnel deactivated successfully" });
  } catch (error) {
    console.error("DELETE Personnel Error:", error);
    return NextResponse.json(
      { message: "Deletion failed" },
      { status: 500 }
    );
  }
}