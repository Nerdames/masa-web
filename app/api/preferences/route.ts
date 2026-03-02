import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  PreferenceCategory,
} from "@prisma/client";

/* ============================================================
   In-Memory Cache (per server instance)
   ============================================================ */

type CacheEntry<T = unknown> = {
  value: T;
  expiresAt: number;
};

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const preferenceCache = new Map<string, CacheEntry<unknown>>();

function buildCacheKey(params: {
  organizationId: string;
  category: string;
  key: string;
  target: string | null;
  personnelId: string;
  branchId: string | null;
}) {
  return [
    params.organizationId,
    params.category,
    params.key,
    params.target ?? "null",
    params.personnelId,
    params.branchId ?? "null",
  ].join("|");
}

function getFromCache(key: string): unknown {
  const entry = preferenceCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    preferenceCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCache(key: string, value: unknown): void {
  preferenceCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

function invalidateCacheForOrg(orgId: string) {
  for (const key of preferenceCache.keys()) {
    if (key.startsWith(orgId)) {
      preferenceCache.delete(key);
    }
  }
}

/* ============================================================
   GET /api/preferences
   Deterministic Hierarchical Resolution
   USER → BRANCH → ORGANIZATION
   ============================================================ */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const url = new URL(req.url);

    const category = url.searchParams.get(
      "category"
    ) as PreferenceCategory | null;

    const key = url.searchParams.get("key");
    const target = url.searchParams.get("target") ?? null;

    if (!category || !key) {
      return NextResponse.json(
        { success: false, error: "category and key are required" },
        { status: 400 }
      );
    }

    const organizationId = session.user.organizationId;
    const personnelId = session.user.id;
    const branchId = session.user.branchId ?? null;

    /* -------------------------
       Cache Check
    -------------------------- */

    const cacheKey = buildCacheKey({
      organizationId,
      category,
      key,
      target,
      personnelId,
      branchId,
    });

    const cached = getFromCache(cacheKey);
    if (cached !== null) {
      return NextResponse.json({
        success: true,
        preference: cached,
        cached: true,
      });
    }

    /* -------------------------
       Deterministic Fallback
    -------------------------- */

    // 1️⃣ USER (branch-specific)
    if (personnelId && branchId) {
      const userBranchPref = await prisma.preference.findFirst({
        where: {
          organizationId,
          category,
          key,
          target,
          scope: "USER",
          personnelId,
          branchId,
        },
      });

      if (userBranchPref) {
        setCache(cacheKey, userBranchPref.value);
        return NextResponse.json({
          success: true,
          preference: userBranchPref.value,
          meta: { scope: "USER", level: 1 },
        });
      }
    }

    // 2️⃣ USER (global)
    if (personnelId) {
      const userGlobalPref = await prisma.preference.findFirst({
        where: {
          organizationId,
          category,
          key,
          target,
          scope: "USER",
          personnelId,
          branchId: null,
        },
      });

      if (userGlobalPref) {
        setCache(cacheKey, userGlobalPref.value);
        return NextResponse.json({
          success: true,
          preference: userGlobalPref.value,
          meta: { scope: "USER", level: 2 },
        });
      }
    }

    // 3️⃣ BRANCH
    if (branchId) {
      const branchPref = await prisma.preference.findFirst({
        where: {
          organizationId,
          category,
          key,
          target,
          scope: "BRANCH",
          branchId,
          personnelId: null,
        },
      });

      if (branchPref) {
        setCache(cacheKey, branchPref.value);
        return NextResponse.json({
          success: true,
          preference: branchPref.value,
          meta: { scope: "BRANCH", level: 3 },
        });
      }
    }

    // 4️⃣ ORGANIZATION
    const orgPref = await prisma.preference.findFirst({
      where: {
        organizationId,
        category,
        key,
        target,
        scope: "ORGANIZATION",
        branchId: null,
        personnelId: null,
      },
    });

    if (orgPref) {
      setCache(cacheKey, orgPref.value);
      return NextResponse.json({
        success: true,
        preference: orgPref.value,
        meta: { scope: "ORGANIZATION", level: 4 },
      });
    }

    return NextResponse.json({
      success: true,
      preference: null,
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST /api/preferences
   Safe Upsert + Cache Invalidation
   ============================================================ */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { scope, category, key, target, value } = body;

    if (!scope || !category || !key || value === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields",
        },
        { status: 400 }
      );
    }

    const organizationId = session.user.organizationId;
    const personnelId = session.user.id;
    const branchId = session.user.branchId ?? null;

    /* -------------------------
       Role Enforcement
    -------------------------- */

    if (
      scope === "ORGANIZATION" &&
      !session.user.isOrgOwner &&
      session.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    if (scope === "BRANCH" && !branchId) {
      return NextResponse.json(
        { success: false, error: "No branch context" },
        { status: 400 }
      );
    }

    /* -------------------------
       Normalize Ownership
    -------------------------- */

    let finalBranchId: string | null = null;
    let finalPersonnelId: string | null = null;

    if (scope === "BRANCH") {
      finalBranchId = branchId ?? null;
    }

    if (scope === "USER") {
      finalBranchId = branchId ?? null;
      finalPersonnelId = personnelId ?? null;
    }

    /* -------------------------
       Upsert
    -------------------------- */

    const preference = await prisma.preference.upsert({
      where: {
        scope_category_key_organizationId_branchId_personnelId_target: {
          scope,
          category,
          key,
          organizationId,
          branchId: finalBranchId,
          personnelId: finalPersonnelId,
          target: target ?? null,
        },
      },
      update: { value },
      create: {
        organizationId,
        branchId: finalBranchId,
        personnelId: finalPersonnelId,
        scope,
        category,
        key,
        target: target ?? null,
        value,
      },
    });

    /* -------------------------
       Cache Invalidation
    -------------------------- */

    invalidateCacheForOrg(organizationId);

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