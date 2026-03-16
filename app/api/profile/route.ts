"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

import {
  Role,
  Prisma,
  ApprovalStatus,
  CriticalAction,
  NotificationType,
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

interface ProfileApprovalPayload {
  email?: string;
  password?: string;
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

async function mapProfileDTO(personnel: PersonnelWithRelations) {
  const pendingRequests = await prisma.approvalRequest.findMany({
    where: {
      requesterId: personnel.id,
      status: ApprovalStatus.PENDING,
      actionType: {
        in: [CriticalAction.EMAIL_CHANGE, CriticalAction.PASSWORD_CHANGE],
      },
    },
  });

  let pendingEmail: string | null = null;
  let pendingPassword: string | null = null;

  for (const req of pendingRequests) {
    const changes = req.changes as Record<string, any>;

    if (req.actionType === CriticalAction.EMAIL_CHANGE && changes?.email) {
      pendingEmail = changes.email;
    }

    if (req.actionType === CriticalAction.PASSWORD_CHANGE) {
      pendingPassword = "APPROVAL_REQUIRED";
    }
  }

  let primaryRole: Role = Role.CASHIER;

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

  const lockReason =
    personnel.isLocked
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

    lastLoginIp: (personnel as any).lastLoginIp ?? "0.0.0.0",
    lastLoginDevice: (personnel as any).lastLoginDevice ?? "System Interface",

    pendingEmail,
    pendingPassword,

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
      critical:
        log.action.includes("LOCK") ||
        log.action.includes("PASSWORD") ||
        log.action.includes("SECURITY"),
      createdAt: log.createdAt.toISOString(),
      ipAddress: (log as any).ipAddress ?? "0.0.0.0",
      deviceInfo: (log as any).deviceInfo ?? "Internal Call",
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

    const profileDTO = await mapProfileDTO(personnel);

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
    const logActions: string[] = [];

    const isAdmin =
      personnel.isOrgOwner ||
      personnel.branchAssignments.some((a) => a.role === Role.ADMIN);

    const isEmailChange = !!(body.email && body.email !== personnel.email);
    const isPasswordChange = !!body.newPassword;

    ////////////////////////////////////////////////////////////
    // PASSWORD VALIDATION
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
          newFailCount >= 5
            ? new Date(Date.now() + 15 * 60 * 1000)
            : null;

        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: {
            failedLoginAttempts: newFailCount,
            lockoutUntil: lockoutTime,
          },
        });

        return NextResponse.json(
          { error: "Invalid security credentials." },
          { status: 400 }
        );
      }

      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // NAME CHANGE
    ////////////////////////////////////////////////////////////

    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push("PROFILE_IDENTITY_UPDATED");
    }

    ////////////////////////////////////////////////////////////
    // EMAIL CHANGE
    ////////////////////////////////////////////////////////////

    let emailApproval: ProfileApprovalPayload | null = null;

    if (isEmailChange && body.email) {
      const existing = await prisma.authorizedPersonnel.findFirst({
        where: {
          organizationId: personnel.organizationId,
          email: body.email,
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

      if (isAdmin) {
        updateData.email = body.email;
        logActions.push("EMAIL_UPDATED_DIRECTLY");
      } else {
        emailApproval = { email: body.email };
        logActions.push("EMAIL_CHANGE_REQUESTED");
      }
    }

    ////////////////////////////////////////////////////////////
    // PASSWORD CHANGE
    ////////////////////////////////////////////////////////////

    let passwordApproval: ProfileApprovalPayload | null = null;

    if (isPasswordChange && body.newPassword) {
      const hashedPass = await bcrypt.hash(body.newPassword, 12);

      // CRITICAL: If mandatory reset, bypass admin approval and process directly
      if (isAdmin || personnel.requiresPasswordChange) {
        updateData.password = hashedPass;
        
        if (personnel.requiresPasswordChange) {
          updateData.requiresPasswordChange = false; // Lift the flag
          logActions.push("MANDATORY_PASSWORD_RESET_COMPLETED");
        } else {
          logActions.push("PASSWORD_UPDATED_DIRECTLY");
        }
      } else {
        passwordApproval = { password: hashedPass };
        logActions.push("PASSWORD_CHANGE_REQUESTED");
      }
    }

    if (
      Object.keys(updateData).length === 0 &&
      !emailApproval &&
      !passwordApproval
    ) {
      return NextResponse.json(
        { error: "No changes detected or submitted" },
        { status: 400 }
      );
    }

    ////////////////////////////////////////////////////////////
    // TRANSACTION
    ////////////////////////////////////////////////////////////

    const result = await prisma.$transaction(async (tx) => {
      let user = personnel;

      if (Object.keys(updateData).length > 0) {
        user = await tx.authorizedPersonnel.update({
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
      }

      const approvals = [];

      if (emailApproval) {
        approvals.push(
          tx.approvalRequest.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              requesterId: personnel.id,
              actionType: CriticalAction.EMAIL_CHANGE,
              status: ApprovalStatus.PENDING,
              requiredRole: Role.ADMIN,
              changes: emailApproval,
            },
          })
        );
      }

      if (passwordApproval) {
        approvals.push(
          tx.approvalRequest.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              requesterId: personnel.id,
              actionType: CriticalAction.PASSWORD_CHANGE,
              status: ApprovalStatus.PENDING,
              requiredRole: Role.ADMIN,
              changes: passwordApproval,
            },
          })
        );
      }

      const approvalResults = await Promise.all(approvals);

      if (approvalResults.length > 0) {
        await tx.notification.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            targetRole: Role.ADMIN,
            type: NotificationType.APPROVAL_REQUIRED,
            title: "Security Change Approval Required",
            message: `${
              personnel.name || personnel.email
            } requested a core security change.`,
          },
        });

        for (const req of approvalResults) {
          await tx.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              personnelId: personnel.id,
              approvalRequestId: req.id,
              action:
                req.actionType === CriticalAction.EMAIL_CHANGE
                  ? "SECURITY_EMAIL_REQUEST"
                  : "SECURITY_PASSWORD_REQUEST",
              metadata: { status: "PENDING_ADMIN" },
            },
          });
        }
      }

      for (const action of logActions) {
        await tx.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            personnelId: personnel.id,
            action,
            metadata: { changes: Object.keys(updateData) },
          },
        });
      }

      return user;
    });

    const updatedProfileDTO = await mapProfileDTO(
      result as PersonnelWithRelations
    );

    return NextResponse.json({
      success: true,
      requiresApproval: !!(emailApproval || passwordApproval),
      message:
        emailApproval || passwordApproval
          ? "Security changes have been queued for Admin approval."
          : "Identity updated successfully.",
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