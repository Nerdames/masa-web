// pages/api/preferences/route.ts

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/* ---------------------------------- */
/* TYPES / ENUMS */
/* ---------------------------------- */
export type PreferenceScope = "USER" | "BRANCH" | "ORGANIZATION";
export type PreferenceCategory =
  | "UI"
  | "LAYOUT"
  | "TABLE"
  | "NOTIFICATION"
  | "SYSTEM";

interface PreferencePayload {
  organizationId: string;
  branchId?: string;
  personnelId?: string;
  scope: PreferenceScope;
  category: PreferenceCategory;
  key: string;
  target?: string;
  value: unknown;
}

/* ---------------------------------- */
/* HELPERS */
/* ---------------------------------- */
function normalizeId(id?: string | null): string | undefined {
  if (!id || id === "undefined") return undefined;
  return id;
}

/* Preference resolution priority
   1 → USER + BRANCH
   2 → USER (global)
   3 → BRANCH
   4 → ORGANIZATION
*/
function getPreferenceLevel(pref: {
  scope: PreferenceScope;
  personnelId?: string | null;
  branchId?: string | null;
}): number {
  if (pref.scope === "USER" && pref.personnelId && pref.branchId) return 1;
  if (pref.scope === "USER" && pref.personnelId) return 2;
  if (pref.scope === "BRANCH" && pref.branchId) return 3;
  return 4;
}

/* ---------------------------------- */
/* GET /api/preferences */
/* ---------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const organizationId = normalizeId(url.searchParams.get("organizationId"));
    const category = url.searchParams.get(
      "category"
    ) as PreferenceCategory | null;
    const key = url.searchParams.get("key");

    let branchId = normalizeId(url.searchParams.get("branchId"));
    let personnelId = normalizeId(url.searchParams.get("personnelId"));
    const target = normalizeId(url.searchParams.get("target"));

    if (!organizationId || !category || !key) {
      return NextResponse.json(
        {
          success: false,
          error: "organizationId, category and key are required",
        },
        { status: 400 }
      );
    }

    // Session fallback
    const session = await getServerSession(authOptions);
    if (!personnelId && session?.user?.id) {
      personnelId = session.user.id;
    }
    if (!branchId && session?.user?.branchId) {
      branchId = session.user.branchId ?? undefined;
    }

    // Build scope resolution tree
    const orConditions: Array<{
      scope: PreferenceScope;
      branchId: string | null;
      personnelId: string | null;
    }> = [
      { scope: "ORGANIZATION", branchId: null, personnelId: null },
    ];

    if (branchId) {
      orConditions.push({
        scope: "BRANCH",
        branchId,
        personnelId: null,
      });
    }

    if (personnelId) {
      if (branchId) {
        orConditions.push({
          scope: "USER",
          branchId,
          personnelId,
        });
      }

      orConditions.push({
        scope: "USER",
        branchId: null,
        personnelId,
      });
    }

    const preferences = await prisma.preference.findMany({
      where: {
        organizationId,
        category,
        key,
        target: target ?? null,
        OR: orConditions,
      },
    });

    if (!preferences.length) {
      return NextResponse.json({
        success: true,
        preference: null,
      });
    }

    // Resolve highest-priority match
    preferences.sort(
      (a, b) => getPreferenceLevel(a) - getPreferenceLevel(b)
    );

    const resolved = preferences[0];

    return NextResponse.json({
      success: true,
      preference: resolved.value,
      meta: {
        scope: resolved.scope,
        branchId: resolved.branchId,
        personnelId: resolved.personnelId,
      },
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ---------------------------------- */
/* POST /api/preferences */
/* ---------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body: PreferencePayload = await req.json();
    const session = await getServerSession(authOptions);

    const sessionPersonnelId = session?.user?.id;
    const sessionBranchId = session?.user?.branchId ?? undefined;

    const organizationId = normalizeId(body.organizationId);
    let branchId = normalizeId(body.branchId) ?? sessionBranchId;
    let personnelId = normalizeId(body.personnelId) ?? sessionPersonnelId;

    const { scope, category, key, target, value } = body;

    // Required fields
    if (!organizationId || !scope || !category || !key || value === undefined) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: organizationId, scope, category, key, or value",
        },
        { status: 400 }
      );
    }

    // Scope validations
    if (scope === "ORGANIZATION" && (branchId || personnelId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ORGANIZATION scope cannot have branchId or personnelId",
        },
        { status: 400 }
      );
    }

    if (scope === "BRANCH" && (!branchId || personnelId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "BRANCH scope requires branchId and no personnelId",
        },
        { status: 400 }
      );
    }

    if (scope === "USER" && !personnelId) {
      return NextResponse.json(
        {
          success: false,
          error: "USER scope requires personnelId",
        },
        { status: 400 }
      );
    }

    const preference = await prisma.preference.upsert({
      where: {
        scope_category_key_organizationId_branchId_personnelId_target: {
          scope,
          category,
          key,
          organizationId,
          branchId: branchId ?? null,
          personnelId: personnelId ?? null,
          target: target ?? null,
        },
      },
      update: {
        value, // updatedAt auto-handled by Prisma
      },
      create: {
        organizationId,
        branchId: branchId ?? null,
        personnelId: personnelId ?? null,
        scope,
        category,
        key,
        value,
        target: target ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      preference,
    });
  } catch (error) {
    console.error("Error saving preference:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}