import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

import {
  Role,
  Prisma,
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

type PersonnelWithRelations = Prisma.AuthorizedPersonnelGetPayload<{
  include: {
    organization: true;
    branch: true;
    branchAssignments: { include: { branch: true } };
    preferences: true;
  };
}>;

////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////

/**
 * Validates the session and fetches the full personnel record
 */
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
    },
  });
}

/**
 * Consolidates roles from direct ownership and branch assignments
 */
function resolveRoles(personnel: PersonnelWithRelations): Role[] {
  const roles = new Set<Role>();
  if (personnel.isOrgOwner) roles.add(Role.ADMIN);
  personnel.branchAssignments.forEach((a) => roles.add(a.role));
  return Array.from(roles);
}

/**
 * Transforms the Prisma model into a clean Data Transfer Object
 */
function mapProfileDTO(personnel: PersonnelWithRelations) {
  return {
    id: personnel.id,
    name: personnel.name,
    email: personnel.email,
    staffCode: personnel.staffCode,
    isOrgOwner: personnel.isOrgOwner,
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
      branchLocation: a.branch.location,
      role: a.role,
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

    if (!personnel || personnel.disabled) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    if (!personnel || personnel.disabled) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🔒 LOCKOUT CHECK: Prevent updates if the account is currently throttled
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
    let emailChangeStarted = false;

    ////////////////////////////////////////////////////////////
    // SENSITIVE CHANGE VALIDATION (Password/Email)
    ////////////////////////////////////////////////////////////

    const isSensitiveChange = !!(
      body.newPassword || 
      (body.email && body.email !== personnel.email)
    );

    if (isSensitiveChange) {
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Confirming your current password is required for these changes" },
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

        return NextResponse.json(
          {
            error: `Invalid password. ${Math.max(0, 5 - newFailCount)} attempts remaining before lockout.`,
          },
          { status: 400 }
        );
      }

      // Success: Reset security counters
      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // EMAIL CHANGE INITIATION
    ////////////////////////////////////////////////////////////

    if (body.email && body.email !== personnel.email) {
      const existing = await prisma.authorizedPersonnel.findFirst({
        where: {
          organizationId: personnel.organizationId,
          email: body.email,
          deletedAt: null,
        },
      });

      if (existing) {
        return NextResponse.json({ error: "This email is already registered" }, { status: 400 });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.verificationToken.create({
        data: {
          identifier: body.email,
          token,
          expires,
        },
      });

      emailChangeStarted = true;
      logActions.push(`Email update request: ${body.email}`);
      // NOTE: Here you would typically trigger your email service (e.g., Resend, SendGrid)
    }

    ////////////////////////////////////////////////////////////
    // STANDARD UPDATES
    ////////////////////////////////////////////////////////////

    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push("Name changed");
    }

    if (body.newPassword) {
      updateData.password = await bcrypt.hash(body.newPassword, 12);
      logActions.push("Password updated");
    }

    // Guard against empty updates
    if (Object.keys(updateData).length === 0 && !emailChangeStarted) {
      return NextResponse.json({ error: "No changes detected" }, { status: 400 });
    }

    ////////////////////////////////////////////////////////////
    // DATABASE TRANSACTION
    ////////////////////////////////////////////////////////////

    const updatedUser = await prisma.$transaction(async (tx) => {
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
          },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: personnel.organizationId,
          branchId: personnel.branchId,
          personnelId: personnel.id,
          action: "PROFILE_UPDATE",
          meta: logActions.join(", "),
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      emailChangeStarted,
      profile: mapProfileDTO(updatedUser),
    });

  } catch (error) {
    console.error("PATCH_PROFILE_ERROR", error);
    return NextResponse.json({ error: "An error occurred while updating the profile" }, { status: 500 });
  }
}