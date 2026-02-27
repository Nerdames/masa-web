import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

import {
  Role,
  PreferenceCategory,
  PreferenceScope,
  Prisma,
} from "@prisma/client";

////////////////////////////////////////////////////////////
// SESSION TYPE
////////////////////////////////////////////////////////////

interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

interface AuthSession {
  user?: SessionUser;
}

////////////////////////////////////////////////////////////
// RESPONSE DTOs
////////////////////////////////////////////////////////////

interface BranchAssignmentDTO {
  branchId: string;
  branchName: string;
  branchLocation: string | null;
  role: Role;
}

interface OrganizationDTO {
  id: string;
  name: string;
  active: boolean;
}

interface BranchDTO {
  id: string;
  name: string;
  location: string | null;
  active: boolean;
}

interface PreferenceDTO {
  id: string;
  scope: PreferenceScope;
  category: PreferenceCategory;
  key: string;
  target: string | null;
  value: Prisma.JsonValue;
}

interface ProfileDTO {
  id: string;
  name: string | null;
  email: string;
  staffCode: string | null;

  isOrgOwner: boolean;
  disabled: boolean;

  lastLogin: Date | null;
  lastActivityAt: Date | null;

  organization: OrganizationDTO;

  branch: BranchDTO | null;

  assignments: BranchAssignmentDTO[];

  roles: Role[];

  preferences: PreferenceDTO[];

  createdAt: Date;
  updatedAt: Date;
}

////////////////////////////////////////////////////////////
// REQUEST DTO
////////////////////////////////////////////////////////////

interface UpdateProfileBody {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

////////////////////////////////////////////////////////////
// DB TYPE
////////////////////////////////////////////////////////////

type PersonnelWithRelations =
  Prisma.AuthorizedPersonnelGetPayload<{
    include: {
      organization: true;
      branch: true;
      branchAssignments: {
        include: {
          branch: true;
        };
      };
      preferences: true;
    };
  }>;

////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////

async function requirePersonnel(): Promise<PersonnelWithRelations | null> {
  const session = await getServerSession(authOptions) as AuthSession | null;

  if (!session?.user?.id) {
    return null;
  }

  const personnel = await prisma.authorizedPersonnel.findUnique({
    where: {
      id: session.user.id,
    },
    include: {
      organization: true,

      branch: true,

      branchAssignments: {
        include: {
          branch: true,
        },
      },

      preferences: true,
    },
  });

  return personnel;
}

////////////////////////////////////////////////////////////
// ROLE RESOLUTION
////////////////////////////////////////////////////////////

function resolveRoles(personnel: PersonnelWithRelations): Role[] {
  const roles = new Set<Role>();

  if (personnel.isOrgOwner) {
    roles.add(Role.ADMIN);
  }

  for (const assignment of personnel.branchAssignments) {
    roles.add(assignment.role);
  }

  return Array.from(roles);
}

////////////////////////////////////////////////////////////
// DTO MAPPER
////////////////////////////////////////////////////////////

function mapProfileDTO(personnel: PersonnelWithRelations): ProfileDTO {
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

    assignments: personnel.branchAssignments.map(
      (assignment): BranchAssignmentDTO => ({
        branchId: assignment.branch.id,
        branchName: assignment.branch.name,
        branchLocation: assignment.branch.location,
        role: assignment.role,
      })
    ),

    roles: resolveRoles(personnel),

    preferences: personnel.preferences.map(
      (pref): PreferenceDTO => ({
        id: pref.id,
        scope: pref.scope,
        category: pref.category,
        key: pref.key,
        target: pref.target,
        value: pref.value,
      })
    ),

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

    if (!personnel) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const profile = mapProfileDTO(personnel);

    return NextResponse.json({
      success: true,
      profile,
    });

  } catch (error: unknown) {

    console.error("PROFILE_GET_ERROR", error);

    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

////////////////////////////////////////////////////////////
// PATCH /api/profile
////////////////////////////////////////////////////////////

export async function PATCH(
  request: NextRequest
): Promise<NextResponse> {

  try {

    const personnel = await requirePersonnel();

    if (!personnel) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: UpdateProfileBody =
      (await request.json()) as UpdateProfileBody;

    /////////////////////////////////////////////////////////
    // EMAIL VALIDATION
    /////////////////////////////////////////////////////////

    if (
      body.email &&
      body.email !== personnel.email
    ) {

      const existing =
        await prisma.authorizedPersonnel.findUnique({
          where: {
            organizationId_email: {
              organizationId: personnel.organizationId,
              email: body.email,
            },
          },
          select: { id: true },
        });

      if (existing) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 }
        );
      }
    }

    /////////////////////////////////////////////////////////
    // PASSWORD CHANGE
    /////////////////////////////////////////////////////////

    let passwordHash: string | undefined;

    if (body.newPassword) {

      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Current password required" },
          { status: 400 }
        );
      }

      const valid = await bcrypt.compare(
        body.currentPassword,
        personnel.password
      );

      if (!valid) {
        return NextResponse.json(
          { error: "Invalid current password" },
          { status: 400 }
        );
      }

      passwordHash = await bcrypt.hash(
        body.newPassword,
        12
      );
    }

    /////////////////////////////////////////////////////////
    // UPDATE
    /////////////////////////////////////////////////////////

    const updated =
      await prisma.authorizedPersonnel.update({
        where: {
          id: personnel.id,
        },

        data: {
          name: body.name ?? personnel.name,
          email: body.email ?? personnel.email,
          ...(passwordHash
            ? { password: passwordHash }
            : {}),
        },

        include: {
          organization: true,
          branch: true,
          branchAssignments: {
            include: { branch: true },
          },
          preferences: true,
        },
      });

    /////////////////////////////////////////////////////////
    // RESPONSE
    /////////////////////////////////////////////////////////

    const profile = mapProfileDTO(updated);

    return NextResponse.json({
      success: true,
      profile,
    });

  } catch (error: unknown) {

    console.error("PROFILE_UPDATE_ERROR", error);

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}