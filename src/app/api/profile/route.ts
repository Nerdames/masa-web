import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "@/core/lib/prisma";
import { authOptions } from "@/core/lib/auth";

import {
  Role,
  Prisma,
  ActorType,
  Severity,
} from "@prisma/client";

////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////

interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

interface AuthSession {
  user?: SessionUser;
}

interface UpdateProfileBody {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

interface AuditLogAction {
  action: string;
  severity: Severity;
  critical: boolean;
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

async function requirePersonnel(): Promise<PersonnelWithRelations | null> {
  const session = (await getServerSession(authOptions)) as AuthSession | null;

  if (!session?.user?.id) return null;

  return prisma.authorizedPersonnel.findUnique({
    where: { id: session.user.id },
    include: {
      organization: true,
      branch: true,
      branchAssignments: { include: { branch: true } },
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
  // Fallback to the personnel's base role, overriding hardcoded cashiers
  let primaryRole: Role = personnel.role;

  if (personnel.isOrgOwner) {
    primaryRole = Role.ADMIN;
  } else {
    const primaryAssignment =
      personnel.branchAssignments.find((a) => a.isPrimary) ||
      personnel.branchAssignments[0];

    if (primaryAssignment) primaryRole = primaryAssignment.role;
  }

  const isTemporarilyLocked =
    personnel.lockoutUntil && personnel.lockoutUntil > new Date();

  const lockReason = personnel.isLocked
    ? "Administrative Lock"
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

    // Expose mandatory change flag to the frontend
    requiresPasswordChange: personnel.requiresPasswordChange || false,

    lastLogin: personnel.lastLogin?.toISOString() ?? null,
    lastActivityAt: personnel.lastActivityAt?.toISOString() ?? null,

    // Schema typed fields mapped directly without 'any' casting
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
    const personnel = await requirePersonnel();

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
    const personnel = await requirePersonnel();

    if (!personnel || personnel.disabled) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (personnel.isLocked) {
      return NextResponse.json(
        { error: "Account is administratively locked." },
        { status: 403 }
      );
    }

    if (personnel.lockoutUntil && personnel.lockoutUntil > new Date()) {
      return NextResponse.json(
        {
          error: `Security lockout active. Try again after ${personnel.lockoutUntil.toLocaleTimeString()}`,
        },
        { status: 403 }
      );
    }

    const body: UpdateProfileBody = await request.json();

    const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
    const logActions: AuditLogAction[] = [];

    const isEmailChange = !!(body.email && body.email !== personnel.email);
    const isPasswordChange = !!body.newPassword;

    // Derived primary role for audit tracking
    const actorRole = personnel.isOrgOwner
      ? Role.ADMIN
      : personnel.branchAssignments.find((a) => a.isPrimary)?.role || personnel.role;

    ////////////////////////////////////////////////////////////
    // PASSWORD VALIDATION (SECURITY CHALLENGE)
    ////////////////////////////////////////////////////////////

    if (isEmailChange || isPasswordChange) {
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Current password is required for security changes" },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(
        body.currentPassword,
        personnel.password
      );

      if (!isValid) {
        const newFailCount = (personnel.failedLoginAttempts || 0) + 1;
        const lockoutTime =
          newFailCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: {
            failedLoginAttempts: newFailCount,
            lockoutUntil: lockoutTime,
          },
        });

        // Log failed attempt
        await prisma.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            actorId: personnel.id,
            actorType: ActorType.USER,
            actorRole,
            action: "FAILED_SECURITY_CHALLENGE",
            severity: Severity.HIGH,
            critical: true,
            description: `Failed security challenge during profile update. Attempt ${newFailCount}/5.`,
            metadata: { lockedOut: !!lockoutTime },
          },
        });

        return NextResponse.json(
          { error: "Invalid security credentials." },
          { status: 400 }
        );
      }

      // Reset strikes upon successful challenge
      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // NAME CHANGE
    ////////////////////////////////////////////////////////////

    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push({
        action: "PROFILE_IDENTITY_UPDATED",
        severity: Severity.LOW,
        critical: false,
        before: { name: personnel.name },
        after: { name: body.name },
      });
    }

    ////////////////////////////////////////////////////////////
    // EMAIL CHANGE (SELF-SERVICE)
    ////////////////////////////////////////////////////////////

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
          { error: "This email is already in use by another personnel record" },
          { status: 400 }
        );
      }

      updateData.email = normalizedEmail;
      logActions.push({
        action: "EMAIL_UPDATED_DIRECTLY",
        severity: Severity.HIGH,
        critical: true,
        before: { email: personnel.email },
        after: { email: normalizedEmail },
      });
    }

    ////////////////////////////////////////////////////////////
    // PASSWORD CHANGE (SELF-SERVICE)
    ////////////////////////////////////////////////////////////

    if (isPasswordChange && body.newPassword) {
      const hashedPass = await bcrypt.hash(body.newPassword, 12);
      
      updateData.password = hashedPass;

      if (personnel.requiresPasswordChange) {
        updateData.requiresPasswordChange = false; 
        logActions.push({
          action: "MANDATORY_PASSWORD_RESET_COMPLETED",
          severity: Severity.HIGH,
          critical: true,
        });
      } else {
        logActions.push({
          action: "PASSWORD_UPDATED_DIRECTLY",
          severity: Severity.HIGH,
          critical: true,
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No changes detected or submitted" },
        { status: 400 }
      );
    }

    ////////////////////////////////////////////////////////////
    // TRANSACTION
    ////////////////////////////////////////////////////////////

    const result = await prisma.$transaction(async (tx) => {
      // 1. Commit Direct Profile Changes
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

      // 2. Commit Forensic Action Logs
      for (const log of logActions) {
        await tx.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            actorId: personnel.id,
            actorType: ActorType.USER,
            actorRole,
            action: log.action,
            severity: log.severity,
            critical: log.critical,
            before: log.before ? (log.before as Prisma.InputJsonValue) : Prisma.DbNull,
            after: log.after ? (log.after as Prisma.InputJsonValue) : Prisma.DbNull,
            metadata: { 
              directCommit: true,
              selfService: true 
            } as Prisma.InputJsonValue,
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
      { error: "Internal server error during profile update" },
      { status: 500 }
    );
  }
}