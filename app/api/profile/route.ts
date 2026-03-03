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
        take: 10,
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

function resolveRoles(personnel: PersonnelWithRelations): Role[] {
  const roles = new Set<Role>();
  if (personnel.isOrgOwner) roles.add(Role.ADMIN);
  personnel.branchAssignments.forEach((a) => roles.add(a.role));
  return Array.from(roles);
}

function mapProfileDTO(personnel: PersonnelWithRelations) {
  return {
    id: personnel.id,
    name: personnel.name,
    email: personnel.email,
    staffCode: personnel.staffCode,
    isOrgOwner: personnel.isOrgOwner,
    isLocked: personnel.isLocked,
    disabled: personnel.disabled,
    lastLogin: personnel.lastLogin,
    lastActivityAt: personnel.lastActivityAt,
    organization: {
      id: personnel.organization.id,
      name: personnel.organization.name,
      active: personnel.organization.active,
    },
    branch: personnel.branch
      ? {
          id: personnel.branch.id,
          name: personnel.branch.name,
          location: personnel.branch.location,
          active: personnel.branch.active,
        }
      : null,
    assignments: personnel.branchAssignments.map((a) => ({
      branchId: a.branch.id,
      branchName: a.branch.name,
      branchLocation: a.branch.location, // Crucial for frontend copy feature
      role: a.role,
    })),
    activityLogs: personnel.activityLogs.map((log) => ({
      id: log.id,
      action: log.action.replace(/_/g, " "), // Format for UI: "PROFILE_UPDATED" -> "PROFILE UPDATED"
      createdAt: log.createdAt,
    })),
    roles: resolveRoles(personnel),
    preferences: personnel.preferences.map((p) => ({
      id: p.id,
      scope: p.scope,
      category: p.category,
      key: p.key,
      target: p.target,
      value: p.value,
    })),
    createdAt: personnel.createdAt,
    updatedAt: personnel.updatedAt,
  };
}

////////////////////////////////////////////////////////////
// GET /api/profile
////////////////////////////////////////////////////////////

export async function GET(): Promise<NextResponse> {
  try {
    const personnel = await requirePersonnel();

    if (!personnel || personnel.disabled || personnel.isLocked) {
      return NextResponse.json({ error: "Unauthorized or account locked" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      profile: mapProfileDTO(personnel),
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

    if (!personnel || personnel.disabled || personnel.isLocked) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🔒 LOCKOUT CHECK
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
    const roles = resolveRoles(personnel);
    const isAdmin = roles.includes(Role.ADMIN);

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

        return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
      }

      // Reset fails on valid password entry
      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // PROCESS CHANGES
    ////////////////////////////////////////////////////////////

    // Non-sensitive: Name
    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push("Name update");
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
        return NextResponse.json({ error: "This email is already in use" }, { status: 400 });
      }

      if (isAdmin) {
        updateData.email = body.email;
        logActions.push("Email updated directly by Admin");
      } else {
        requiresApproval = true;
        approvalPayload.email = body.email;
        logActions.push("Email change approval requested");
      }
    }

    // Sensitive: Password
    if (isPasswordChange && body.newPassword) {
      const hashedPass = await bcrypt.hash(body.newPassword, 12);
      if (isAdmin) {
        updateData.password = hashedPass;
        logActions.push("Password updated directly by Admin");
      } else {
        requiresApproval = true;
        approvalPayload.password = hashedPass;
        logActions.push("Password change approval requested");
      }
    }

    if (Object.keys(updateData).length === 0 && !requiresApproval) {
      return NextResponse.json({ error: "No changes detected" }, { status: 400 });
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
            branchId: personnel.branchId,
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
            message: `${personnel.name || personnel.email} requested a security change.`,
          },
        });

        // 4. Link Request to Log
        await tx.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            personnelId: personnel.id,
            approvalRequestId: request.id,
            action: "PROFILE_CHANGE_REQUESTED",
            meta: JSON.stringify({ fields: Object.keys(approvalPayload) }),
          },
        });
      }

      // 5. General Activity Log
      await tx.activityLog.create({
        data: {
          organizationId: personnel.organizationId,
          branchId: personnel.branchId,
          personnelId: personnel.id,
          action: "PROFILE_PATCH_EXECUTED",
          meta: logActions.join("; "),
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      requiresApproval,
      message: requiresApproval 
        ? "Security changes are pending Admin approval." 
        : "Profile updated successfully.",
      profile: mapProfileDTO(result as PersonnelWithRelations),
    });

  } catch (error) {
    console.error("PATCH_PROFILE_ERROR", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}