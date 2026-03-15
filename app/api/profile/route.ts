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
  [key: string]: string | undefined;
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

  return prisma.authorizedPersonnel.findFirst({
    where: {
      id: session.user.id,
      deletedAt: null,
    },
    include: {
      organization: true,
      branch: true,
      branchAssignments: { include: { branch: true } },
      preferences: true,
      activityLogs: {
        take: 50, // Increased to give the Live Audit Trail more data
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

// Maps backend relations to exact frontend ProfileDTO
async function mapProfileDTO(personnel: PersonnelWithRelations) {
  // 1. Fetch pending approvals to drive frontend badges
  const pendingRequests = await prisma.approvalRequest.findMany({
    where: { requesterId: personnel.id, status: ApprovalStatus.PENDING },
  });

  let pendingEmail = null;
  let pendingPassword = null;

  pendingRequests.forEach((req) => {
    const changes = req.changes as Record<string, any>;
    if (req.actionType === CriticalAction.EMAIL_CHANGE && changes?.email) {
      pendingEmail = changes.email;
    }
    if (req.actionType === CriticalAction.PASSWORD_CHANGE) {
      pendingPassword = "APPROVAL_REQUIRED";
    }
  });

  // 2. Resolve primary role for UI styling
  let primaryRole: Role = Role.CASHIER; // Fallback
  if (personnel.isOrgOwner) {
    primaryRole = Role.ADMIN;
  } else {
    const primaryAssignment = personnel.branchAssignments.find((a) => a.isPrimary) || personnel.branchAssignments[0];
    if (primaryAssignment) primaryRole = primaryAssignment.role;
  }

  // 3. Check hard lock vs temporary lockout
  const isTemporarilyLocked = personnel.lockoutUntil && personnel.lockoutUntil > new Date();

  return {
    id: personnel.id,
    name: personnel.name,
    email: personnel.email,
    staffCode: personnel.staffCode,
    role: primaryRole,
    isOrgOwner: personnel.isOrgOwner,
    disabled: personnel.disabled,
    isLocked: personnel.isLocked || isTemporarilyLocked,
    lockReason: isTemporarilyLocked ? "Temporary Security Lockout" : null,
    
    // Dates & Auth Metadata
    lastLogin: personnel.lastLogin ? personnel.lastLogin.toISOString() : null,
    lastActivityAt: personnel.lastActivityAt ? personnel.lastActivityAt.toISOString() : null,
    // Note: Cast these using any or fallback if your schema doesn't have explicit IP/Device fields yet
    lastLoginIp: (personnel as any).lastLoginIp || "0.0.0.0", 
    lastLoginDevice: (personnel as any).lastLoginDevice || "System Interface",
    
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
      isPrimary: a.isPrimary, // Required for frontend dot styling
    })),
    
    activityLogs: personnel.activityLogs.map((log) => {
      // Safely parse JSON metadata
      let metadata = null;
      try { metadata = log.meta ? JSON.parse(log.meta as string) : null; } catch { metadata = log.meta; }

      return {
        id: log.id,
        action: log.action,
        critical: log.action.includes("LOCK") || log.action.includes("PASSWORD") || log.action.includes("SECURITY"),
        createdAt: log.createdAt.toISOString(),
        ipAddress: (log as any).ipAddress || "0.0.0.0",
        deviceInfo: (log as any).deviceInfo || "Internal Call",
        personnel: { name: personnel.name }, // Contextualize the actor
        metadata,
      };
    }),
  };
}

////////////////////////////////////////////////////////////
// GET /api/profile
////////////////////////////////////////////////////////////

export async function GET(): Promise<NextResponse> {
  try {
    const personnel = await requirePersonnel();

    if (!personnel || personnel.disabled) {
      return NextResponse.json({ error: "Unauthorized or account disabled" }, { status: 401 });
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

    // 🔒 HARD LOCKOUT CHECK
    if (personnel.isLocked) {
        return NextResponse.json({ error: "Account is administratively locked." }, { status: 403 });
    }

    // ⏱️ TEMPORARY LOCKOUT CHECK
    if (personnel.lockoutUntil && personnel.lockoutUntil > new Date()) {
      return NextResponse.json(
        { error: `Security lockout active. Try again after ${personnel.lockoutUntil.toLocaleTimeString()}` },
        { status: 403 }
      );
    }

    const body: UpdateProfileBody = await request.json();
    const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
    const logActions: string[] = [];
    
    let requiresApproval = false;
    const approvalPayload: ProfileApprovalPayload = {};
    const isAdmin = personnel.isOrgOwner || personnel.branchAssignments.some(a => a.role === "ADMIN");

    ////////////////////////////////////////////////////////////
    // SENSITIVE CHANGE VALIDATION
    ////////////////////////////////////////////////////////////

    const isEmailChange = !!(body.email && body.email !== personnel.email);
    const isPasswordChange = !!body.newPassword;

    if (isEmailChange || isPasswordChange) {
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Current password is required for security changes" },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(body.currentPassword, personnel.password);

      if (!isValid) {
        const newFailCount = (personnel.failedLoginAttempts || 0) + 1;
        const lockoutTime = newFailCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: {
            failedLoginAttempts: newFailCount,
            lockoutUntil: lockoutTime,
          },
        });

        return NextResponse.json({ error: "Invalid security credentials." }, { status: 400 });
      }

      // Reset fails on valid password entry
      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // PROCESS CHANGES
    ////////////////////////////////////////////////////////////

    // Non-sensitive: Name (Triggers directly from InspectorPanel)
    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push("PROFILE_IDENTITY_UPDATED");
    }

    // Sensitive: Email
    if (isEmailChange && body.email) {
      const existing = await prisma.authorizedPersonnel.findFirst({
        where: {
          organizationId: personnel.organizationId,
          email: body.email,
          deletedAt: null,
        },
      });

      if (existing) {
        return NextResponse.json({ error: "This email is already in use by another personnel record" }, { status: 400 });
      }

      if (isAdmin) {
        updateData.email = body.email;
        logActions.push("EMAIL_UPDATED_DIRECTLY");
      } else {
        requiresApproval = true;
        approvalPayload.email = body.email;
        logActions.push("EMAIL_CHANGE_REQUESTED");
      }
    }

    // Sensitive: Password
    if (isPasswordChange && body.newPassword) {
      const hashedPass = await bcrypt.hash(body.newPassword, 12);
      if (isAdmin) {
        updateData.password = hashedPass;
        logActions.push("PASSWORD_UPDATED_DIRECTLY");
      } else {
        requiresApproval = true;
        approvalPayload.password = hashedPass;
        logActions.push("PASSWORD_CHANGE_REQUESTED");
      }
    }

    if (Object.keys(updateData).length === 0 && !requiresApproval) {
      return NextResponse.json({ error: "No changes detected or submitted" }, { status: 400 });
    }

    ////////////////////////////////////////////////////////////
    // DATABASE TRANSACTION
    ////////////////////////////////////////////////////////////

    const result = await prisma.$transaction(async (tx) => {
      // 1. Execute immediate updates
      const user = await tx.authorizedPersonnel.update({
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

      // 2. Create Approval Request if needed
      if (requiresApproval) {
        const actionType = isEmailChange 
            ? CriticalAction.EMAIL_CHANGE 
            : CriticalAction.PASSWORD_CHANGE;

        const request = await tx.approvalRequest.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId, // Optional based on your schema
            requesterId: personnel.id,
            actionType,
            status: ApprovalStatus.PENDING,
            requiredRole: Role.ADMIN,
            changes: approvalPayload,
          },
        });

        // 3. Internal Notification
        await tx.notification.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            targetRole: Role.ADMIN,
            type: NotificationType.APPROVAL_REQUIRED,
            title: "Security Change Approval Required",
            message: `${personnel.name || personnel.email} requested a core security change.`,
          },
        });

        // 4. Link Request to Log
        await tx.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            personnelId: personnel.id,
            approvalRequestId: request.id,
            action: isEmailChange ? "SECURITY_EMAIL_REQUEST" : "SECURITY_PASSWORD_REQUEST",
            meta: JSON.stringify({ fields: Object.keys(approvalPayload), status: "PENDING_ADMIN" }),
          },
        });
      }

      // 5. General Activity Log for immediate changes (e.g., Name)
      if (Object.keys(updateData).length > 0) {
          await tx.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              personnelId: personnel.id,
              action: logActions[0] || "PROFILE_UPDATE",
              meta: JSON.stringify({ changes: Object.keys(updateData) }),
            },
          });
      }

      return user;
    });

    const updatedProfileDTO = await mapProfileDTO(result as PersonnelWithRelations);

    return NextResponse.json({
      success: true,
      requiresApproval,
      message: requiresApproval 
        ? "Security changes have been queued for Admin approval." 
        : "Identity updated successfully.",
      profile: updatedProfileDTO,
    });

  } catch (error) {
    console.error("PATCH_PROFILE_ERROR", error);
    return NextResponse.json({ error: "Internal server error during profile update" }, { status: 500 });
  }
}