// pages/api/preferences/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
  key: string;       // e.g., "summary"
  target?: string;   // e.g., "summary-inventory-page"
  value: unknown;    // JSON blob with all layout data
}

/* ---------------------------------- */
/* HELPERS */
/* ---------------------------------- */
function normalizeId(id?: string | null): string | undefined {
  if (!id || id === "undefined") return undefined;
  return id;
}

/* Helper to determine preference priority */
function getPreferenceLevel(pref: {
  scope: PreferenceScope;
  personnelId?: string | null;
  branchId?: string | null;
}): number {
  if (pref.scope === "USER" && pref.personnelId && pref.branchId) return 1; // USER+BRANCH
  if (pref.scope === "USER" && pref.personnelId) return 2; // USER global
  if (pref.scope === "BRANCH" && pref.branchId) return 3; // BRANCH
  return 4; // ORGANIZATION
}

/* ---------------------------------- */
/* GET /api/preferences?organizationId=...&branchId=...&personnelId=...&key=...&target=... */
/* ---------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const organizationId = normalizeId(url.searchParams.get("organizationId"));
    const branchId = normalizeId(url.searchParams.get("branchId"));
    const personnelId = normalizeId(url.searchParams.get("personnelId"));
    const key = url.searchParams.get("key");
    const target = normalizeId(url.searchParams.get("target"));

    if (!organizationId || !key) {
      return NextResponse.json(
        { success: false, error: "organizationId and key are required" },
        { status: 400 }
      );
    }

    // Fetch all possible preferences for this key + target
    const preferences = await prisma.preference.findMany({
      where: {
        organizationId,
        key,
        target,
        OR: [
          { scope: "USER", personnelId, branchId },
          { scope: "USER", personnelId, branchId: null },
          { scope: "BRANCH", branchId },
          { scope: "ORGANIZATION" },
        ],
      },
    });

    if (!preferences.length) {
      return NextResponse.json({ success: true, preference: null });
    }

    // Resolve priority explicitly
    let resolved = preferences[0];
    let minLevel = getPreferenceLevel(resolved);

    for (const pref of preferences) {
      const level = getPreferenceLevel(pref);
      if (level < minLevel) {
        resolved = pref;
        minLevel = level;
      }
    }

    return NextResponse.json({ success: true, preference: resolved.value });
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

    const organizationId = normalizeId(body.organizationId);
    const branchId = normalizeId(body.branchId);
    const personnelId = normalizeId(body.personnelId);
    const { scope, category, key, target, value } = body;

    // Validation
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

    // Upsert single record per target
    const preference = await prisma.preference.upsert({
      where: {
        scope_key_organizationId_branchId_personnelId_target: {
          scope,
          key,
          organizationId,
          branchId: branchId ?? null,
          personnelId: personnelId ?? null,
          target: target ?? null,
        },
      },
      update: { value, updatedAt: new Date() },
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

    return NextResponse.json({ success: true, preference });
  } catch (error) {
    console.error("Error saving preference:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
