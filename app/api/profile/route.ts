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

    // 🔒 LOCKOUT CHECK
    if (personnel.lockoutUntil && personnel.lockoutUntil > new Date()) {
      return NextResponse.json(
        {
          error: `Account locked. Try again after ${personnel.lockoutUntil.toLocaleTimeString()}`,
        },
        { status: 403 }
      );
    }

    const body: UpdateProfileBody = await request.json();
    const updateData: Prisma.AuthorizedPersonnelUpdateInput = {};
    const logActions: string[] = [];
    let emailChangeStarted = false;

    ////////////////////////////////////////////////////////////
    // PASSWORD VALIDATION FOR SENSITIVE CHANGES
    ////////////////////////////////////////////////////////////

    const isSensitiveChange =
      body.newPassword ||
      (body.email && body.email !== personnel.email);

    if (isSensitiveChange) {
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Current password required for this change" },
          { status: 400 }
        );
      }

      const isValid = await bcrypt.compare(
        body.currentPassword,
        personnel.password
      );

      if (!isValid) {
        const newFailCount = personnel.failedLoginAttempts + 1;
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
          {
            error: `Invalid password. ${Math.max(
              0,
              5 - newFailCount
            )} attempts remaining.`,
          },
          { status: 400 }
        );
      }

      // reset lockout counters
      updateData.failedLoginAttempts = 0;
      updateData.lockoutUntil = null;
    }

    ////////////////////////////////////////////////////////////
    // EMAIL CHANGE (Verification Required)
    ////////////////////////////////////////////////////////////

    if (body.email && body.email !== personnel.email) {
      const existing =
        await prisma.authorizedPersonnel.findFirst({
          where: {
            organizationId: personnel.organizationId,
            email: body.email,
            deletedAt: null,
          },
        });

      if (existing) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 }
        );
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      );

      await prisma.verificationToken.create({
        data: {
          identifier: body.email,
          token,
          expires,
        },
      });

      emailChangeStarted = true;
      logActions.push(`Email change initiated to ${body.email}`);

      // TODO: send email with link:
      // `${BASE_URL}/api/profile/verify?token=${token}`
    }

    ////////////////////////////////////////////////////////////
    // NAME CHANGE
    ////////////////////////////////////////////////////////////

    if (body.name && body.name !== personnel.name) {
      updateData.name = body.name;
      logActions.push("Name updated");
    }

    ////////////////////////////////////////////////////////////
    // PASSWORD CHANGE
    ////////////////////////////////////////////////////////////

    if (body.newPassword) {
      updateData.password = await bcrypt.hash(body.newPassword, 12);
      logActions.push("Password updated");
    }

    if (
      Object.keys(updateData).length === 0 &&
      !emailChangeStarted
    ) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 }
      );
    }

    ////////////////////////////////////////////////////////////
    // TRANSACTION: UPDATE + LOG
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
            branchAssignments: {
              include: { branch: true },
            },
            preferences: true,
          },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: personnel.organizationId,
          branchId: personnel.branchId ?? null,
          personnelId: personnel.id,
          action: "PROFILE_UPDATE",
          meta: logActions.join("; "),
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
    return NextResponse.json(
      { error: "Update failed" },
      { status: 500 }
    );
  }
}