import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "@/core/lib/prisma";
import { authOptions } from "@/core/lib/auth";
import { createAuditLog } from "@/core/lib/audit";
import { authorize } from "@/core/lib/permission";

import {
  Role,
  Prisma,
  ActorType,
  Severity,
  Resource,
  CriticalAction,
  PermissionAction,
} from "@prisma/client";

////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////

interface UpdateProfileBody {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

interface AuditLogAction {
  action: string;
  description: string;
  severity: Severity;
  critical: boolean;
  actionTrigger?: CriticalAction;
  before?: Record<string, any>;
  after?: Record<string, any>;
}

type PersonnelWithRelations = Prisma.AuthorizedPersonnelGetPayload<{
  include: {
    organization: true;
    branch: true;
    branchAssignments: { include: { branch: true } };
    preferences: true;
    activityLogs: {
      take: number;
      orderBy: { createdAt: "desc" };
    };
  };
}>;

////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////

async function requirePersonnel(userId: string): Promise<PersonnelWithRelations | null> {
  return prisma.authorizedPersonnel.findUnique({
    where: { 
      id: userId,
      deletedAt: null 
    },
    include: {
      organization: true,
      branch: true,
      branchAssignments: { 
        where: { branch: { active: true, deletedAt: null } },
        include: { branch: true } 
      },
      preferences: true,
      activityLogs: {
        take: 50,
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

function safeParseJSON(meta: unknown) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return meta;
    }
  }
  return null;
}

////////////////////////////////////////////////////////////
// DTO MAPPER
////////////////////////////////////////////////////////////

function mapProfileDTO(personnel: PersonnelWithRelations) {
  let primaryRole: Role = personnel.role;

  if (personnel.isOrgOwner) {
    primaryRole = Role.ADMIN;
  } else {
    const primaryAssignment =
      personnel.branchAssignments.find((a) => a.isPrimary) ||
      personnel.branchAssignments[0];

    if (primaryAssignment) primaryRole = primaryAssignment.role;
  }

  const now = new Date();
  const isTemporarilyLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;

  const lockReason = personnel.isLocked
    ? personnel.lockReason || "Administrative Lock"
    : isTemporarilyLocked
    ? "Temporary Security Lockout"
    : null;

  return {
    id: personnel.id,
    name: personnel.name,
    email: personnel.email,
    staffCode: personnel.staffCode,
    role: primaryRole,
    isOrgOwner: personnel.isOrgOwner,
    disabled: personnel.disabled,
    isLocked: personnel.isLocked || isTemporarilyLocked,
    lockReason,
    lockoutUntil: personnel.lockoutUntil?.toISOString() ?? null,

    requiresPasswordChange: personnel.requiresPasswordChange || false,

    lastLogin: personnel.lastLogin?.toISOString() ?? null,
    lastActivityAt: personnel.lastActivityAt?.toISOString() ?? null,

    lastLoginIp: personnel.lastLoginIp ?? "0.0.0.0",
    lastLoginDevice: personnel.lastLoginDevice ?? "System Interface",

    organization: {
      id: personnel.organization.id,
      name: personnel.organization.name,
    },

    assignments: personnel.branchAssignments.map((a) => ({
      id: a.id,
      branchId: a.branch.id,
      branchName: a.branch.name,
      branchLocation: a.branch.location,
      role: a.role,
      isPrimary: a.isPrimary,
    })),

    activityLogs: personnel.activityLogs.map((log) => ({
      id: log.id,
      action: log.action,
      severity: log.severity,
      critical: log.critical,
      createdAt: log.createdAt.toISOString(),
      ipAddress: log.ipAddress ?? "0.0.0.0",
      deviceInfo: log.deviceInfo ?? "Internal Call",
      personnel: { name: personnel.name },
      metadata: safeParseJSON(log.metadata),
    })),
  };
}

////////////////////////////////////////////////////////////
// GET /api/profile
////////////////////////////////////////////////////////////

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personnel = await requirePersonnel(session.user.id);

    if (!personnel || personnel.disabled) {
      return NextResponse.json(
        { error: "Unauthorized or account disabled" },
        { status: 401 }
      );
    }

    const profileDTO = mapProfileDTO(personnel);

    return NextResponse.json({
      success: true,
      profile: profileDTO,
    });
  } catch (error) {
    console.error("GET_PROFILE_ERROR", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

////////////////////////////////////////////////////////////
// PATCH /api/profile
////////////////////////////////////////////////////////////

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const personnel = await requirePersonnel(session.user.id);

    // Network context for forensic logging
    const ipAddress = (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) || "127.0.0.1";
    const deviceInfo = request.headers.get("user-agent") || "System Interface";

    if (!personnel || personnel.disabled) {
      return NextResponse.json({ error: "Unauthorized or disabled account" }, { status: 401 });
    }

    // LOCKOUT CHECK: Stop processing immediately if under administrative or temporary lock
    const isTemporarilyLocked = personnel.lockoutUntil && personnel.lockoutUntil > new Date();
    
    if (personnel.isLocked || isTemporarilyLocked) {
      return NextResponse.json(
        {
          error: "ROTATION_BLOCKED",
          message: personnel.isLocked
            ? "Account is administratively locked."
            : `Security lockout active. Try again after ${personnel.lockoutUntil?.toLocaleTimeString()}`,
        },
        { status: 403 }
      );
    }

    const body: UpdateProfileBody = await request.json();
    const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
    const logActions: AuditLogAction[] = [];

    const isEmailChange = !!(body.email && body.email !== personnel.email);
    const isPasswordChange = !!body.newPassword;

    const actorRole = session.user.role;
    const userPermissions = session.user.permissions || [];
    const isOrgOwner = session.user.isOrgOwner;

    ////////////////////////////////////////////////////////////
    // RBAC PERMISSION ENFORCEMENT
    ////////////////////////////////////////////////////////////

    if (isEmailChange) {
      const emailAuthCheck = authorize({
        role: actorRole,
        isOrgOwner,
        action: PermissionAction.UPDATE,
        resources: Resource.PERSONNEL,
        userPermissions,
        criticalAction: CriticalAction.EMAIL_CHANGE,
      });

      if (!emailAuthCheck.allowed && emailAuthCheck.requiresApproval) {
        return NextResponse.json(
          { error: "Email change requires administrative approval per organizational policy." },
          { status: 403 }
        );
      }
    }

    if (isPasswordChange && !personnel.requiresPasswordChange) {
      // If it's an optional self-service rotation, check if their role has the weight to do it
      const passAuthCheck = authorize({
        role: actorRole,
        isOrgOwner,
        action: PermissionAction.UPDATE,
        resources: Resource.PERSONNEL,
        userPermissions,
        criticalAction: CriticalAction.PASSWORD_CHANGE,
      });

      if (!passAuthCheck.allowed && passAuthCheck.requiresApproval) {
        return NextResponse.json(
          { error: "Password rotation requires administrative approval per organizational policy." },
          { status: 403 }
        );
      }
    }

    ////////////////////////////////////////////////////////////
    // PASSWORD VALIDATION (SECURITY CHALLENGE)
    ////////////////////////////////////////////////////////////

    if (isEmailChange || isPasswordChange) {
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Current password is required for security changes." },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(body.currentPassword, personnel.password);

      if (!isValid) {
        const newFailCount = (personnel.failedLoginAttempts || 0) + 1;
        const isNowLocked = newFailCount >= 5;
        const lockoutTime = isNowLocked ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: {
            failedLoginAttempts: newFailCount,
            lockoutUntil: lockoutTime,
            isLocked: isNowLocked ? true : personnel.isLocked,
            lockReason: isNowLocked ? "Exceeded maximum failed security challenges" : personnel.lockReason,
          },
        });

        // Trigger Critical Action Logging if account just got locked
        await createAuditLog(prisma, {
          action: "FAILED_SECURITY_CHALLENGE",
          resource: Resource.PERSONNEL,
          resourceId: personnel.id,
          organizationId: personnel.organizationId,
          branchId: personnel.branchId,
          actorId: personnel.id,
          actorRole,
          severity: Severity.HIGH,
          critical: true,
          actionTrigger: isNowLocked ? CriticalAction.USER_LOCK_UNLOCK : undefined,
          ipAddress,
          deviceInfo,
          description: `Failed security challenge. Attempt ${newFailCount}/5.`,
          metadata: { lockedOut: isNowLocked, tempLockout: !!lockoutTime },
        });

        return NextResponse.json(
          {
            error: isNowLocked ? "ROTATION_BLOCKED" : "Invalid security credentials.",
            strikes: newFailCount,
          },
          { status: isNowLocked ? 403 : 400 }
        );
      }

      // Reset strikes upon successful validation
      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // DATA MUTATIONS & ACTION LOGGING
    ////////////////////////////////////////////////////////////

    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push({
        action: "PROFILE_IDENTITY_UPDATED",
        description: "User updated their display name.",
        severity: Severity.LOW,
        critical: false,
        before: { name: personnel.name },
        after: { name: body.name },
      });
    }

    if (isEmailChange && body.email) {
      const normalizedEmail = body.email.toLowerCase().trim();

      const existing = await prisma.authorizedPersonnel.findFirst({
        where: {
          organizationId: personnel.organizationId,
          email: normalizedEmail,
          deletedAt: null,
          id: { not: personnel.id },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "This email is already in use by another personnel record." },
          { status: 400 }
        );
      }

      updateData.email = normalizedEmail;
      logActions.push({
        action: "EMAIL_UPDATED_DIRECTLY",
        description: "User successfully changed their account email address.",
        severity: Severity.HIGH,
        critical: true,
        actionTrigger: CriticalAction.EMAIL_CHANGE,
        before: { email: personnel.email },
        after: { email: normalizedEmail },
      });
    }

    if (isPasswordChange && body.newPassword) {
      const hashedPass = await bcrypt.hash(body.newPassword, 12);
      updateData.password = hashedPass;

      if (personnel.requiresPasswordChange) {
        updateData.requiresPasswordChange = false;
        logActions.push({
          action: "MANDATORY_PASSWORD_RESET_COMPLETED",
          description: "User completed their mandatory password rotation.",
          severity: Severity.HIGH,
          critical: true,
          actionTrigger: CriticalAction.PASSWORD_CHANGE,
        });
      } else {
        logActions.push({
          action: "PASSWORD_UPDATED_DIRECTLY",
          description: "User successfully rotated their password.",
          severity: Severity.HIGH,
          critical: true,
          actionTrigger: CriticalAction.PASSWORD_CHANGE,
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No changes detected or submitted." },
        { status: 400 }
      );
    }

    ////////////////////////////////////////////////////////////
    // TRANSACTION: DATABASE & LEDGER COMMIT
    ////////////////////////////////////////////////////////////

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.authorizedPersonnel.update({
        where: { id: personnel.id },
        data: updateData,
        include: {
          organization: true,
          branch: true,
          branchAssignments: { include: { branch: true } },
          preferences: true,
          activityLogs: {
            take: 10,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      // Commit to the cryptographic audit ledger
      for (const log of logActions) {
        await createAuditLog(tx, {
          action: log.action,
          resource: Resource.PERSONNEL,
          resourceId: personnel.id,
          organizationId: personnel.organizationId,
          branchId: personnel.branchId,
          actorId: personnel.id,
          actorRole,
          severity: log.severity,
          critical: log.critical,
          description: log.description,
          actionTrigger: log.actionTrigger,
          changes: { from: log.before, to: log.after },
          ipAddress,
          deviceInfo,
          metadata: {
            selfService: true,
            directCommit: true,
          },
        });
      }

      return updatedUser;
    });

    const updatedProfileDTO = mapProfileDTO(result as PersonnelWithRelations);

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
      profile: updatedProfileDTO,
    });
  } catch (error) {
    console.error("PATCH_PROFILE_ERROR", error);
    return NextResponse.json(
      { error: "Internal server error during profile update." },
      { status: 500 }
    );
  }
}