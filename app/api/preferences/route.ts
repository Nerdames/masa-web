import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PreferenceCategory, PreferenceScope } from "@prisma/client";

/* ============================================================
   In-Memory Cache (Per server instance)
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
  personnelId: string | null;
  branchId: string | null;
}) {
  return [
    params.organizationId,
    params.category,
    params.key,
    params.target ?? "null",
    params.personnelId ?? "null",
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

function normalizeTarget(target: string | null | undefined): string | null {
  if (!target || target === "" || target === "null" || target === "undefined") {
    return null;
  }
  return target;
}

/* ============================================================
   GET /api/preferences
   ============================================================ */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const getAll = url.searchParams.get("all") === "true";
    
    const { organizationId, id: personnelId, branchId } = session.user;
    const finalBranchId = branchId ?? null;

    if (getAll) {
      const allPrefs = await prisma.preference.findMany({
        where: {
          organizationId,
          OR: [
            { scope: "ORGANIZATION" },
            { scope: "BRANCH", branchId: finalBranchId },
            { scope: "USER", personnelId },
          ],
        },
      });
      return NextResponse.json({ success: true, preferences: allPrefs });
    }

    const category = url.searchParams.get("category") as PreferenceCategory | null;
    const key = url.searchParams.get("key");
    const target = normalizeTarget(url.searchParams.get("target"));

    if (!category || !key) {
      return NextResponse.json({ success: false, error: "category and key are required" }, { status: 400 });
    }

    const cacheKey = buildCacheKey({ organizationId, category, key, target, personnelId, branchId: finalBranchId });
    const cached = getFromCache(cacheKey);
    if (cached !== null) return NextResponse.json({ success: true, preference: cached, cached: true });

    const candidates = await prisma.preference.findMany({
      where: {
        organizationId,
        category,
        key,
        target,
        OR: [
          { scope: "USER", personnelId, branchId: finalBranchId }, // 1. User specific to branch
          { scope: "USER", personnelId, branchId: null },         // 2. User global
          { scope: "BRANCH", branchId: finalBranchId },          // 3. Branch default
          { scope: "ORGANIZATION" },                             // 4. Org default
        ],
      },
    });

    const getPriority = (p: {scope: PreferenceScope; branchId: string | null}) => {
      if (p.scope === "USER" && p.branchId) return 1;
      if (p.scope === "USER") return 2;
      if (p.scope === "BRANCH") return 3;
      return 4;
    };

    const winner = candidates.sort((a, b) => getPriority(a) - getPriority(b))[0];
    const finalValue = winner ? winner.value : null;

    setCache(cacheKey, finalValue);

    return NextResponse.json({
      success: true,
      preference: finalValue,
      meta: winner ? { scope: winner.scope, level: getPriority(winner) } : null,
    });

  } catch (error) {
    console.error("Preference GET Error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/* ============================================================
   POST /api/preferences
   ============================================================ */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { category, key, value, isGlobal } = body;
    const target = normalizeTarget(body.target);
    const requestedScope = body.scope as PreferenceScope | undefined;

    if (!category || !key || value === undefined) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { organizationId, id: personnelId, branchId, role, isOrgOwner } = session.user;
    const isAdmin = isOrgOwner || role === "ADMIN" || role === "DEV";
    const isManager = role === "MANAGER";

    let scope: PreferenceScope;
    let finalBranchId: string | null = null;
    let finalPersonnelId: string | null = null;

    /* ------------------------------------------------------------
       HIERARCHICAL PERMISSION CHECK
    ------------------------------------------------------------ */
    if (requestedScope === "ORGANIZATION" && isAdmin) {
      scope = "ORGANIZATION";
      // Admin setting for the whole ORG
    } else if (requestedScope === "BRANCH" && (isAdmin || isManager)) {
      scope = "BRANCH";
      finalBranchId = branchId || null;
      // Admin or Manager setting for the specific Branch
    } else if (requestedScope === "USER" || !requestedScope) {
      scope = "USER";
      finalPersonnelId = personnelId;
      finalBranchId = isGlobal ? null : (branchId || null);
      // Everyone setting for themselves
    } else {
      return NextResponse.json({ success: false, error: "Forbidden: Scope access denied" }, { status: 403 });
    }

    const existing = await prisma.preference.findFirst({
      where: {
        scope,
        category,
        key,
        organizationId,
        branchId: finalBranchId,
        personnelId: finalPersonnelId,
        target,
      }
    });

    let preference;
    if (existing) {
      preference = await prisma.preference.update({
        where: { id: existing.id },
        data: { value }
      });
    } else {
      preference = await prisma.preference.create({
        data: {
          organizationId,
          branchId: finalBranchId,
          personnelId: finalPersonnelId,
          scope,
          category,
          key,
          target,
          value,
        },
      });
    }

    invalidateCacheForOrg(organizationId);
    return NextResponse.json({ success: true, preference });
  } catch (error) {
    console.error("Preference POST Error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/* ============================================================
   DELETE /api/preferences
   ============================================================ */

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.organizationId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get("category") as PreferenceCategory;
    const key = url.searchParams.get("key");
    const target = normalizeTarget(url.searchParams.get("target"));
    const isGlobal = url.searchParams.get("isGlobal") === "true";
    const resetScope = (url.searchParams.get("scope") as PreferenceScope) || "USER";

    if (!category || !key) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { organizationId, id: personnelId, branchId, role, isOrgOwner } = session.user;
    const isAdmin = isOrgOwner || role === "ADMIN" || role === "DEV";
    const isManager = role === "MANAGER";

    let finalBranchId: string | null = null;
    let finalPersonnelId: string | null = null;

    /* ------------------------------------------------------------
       HIERARCHICAL RESET CHECK
    ------------------------------------------------------------ */
    if (resetScope === "ORGANIZATION") {
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else if (resetScope === "BRANCH") {
      if (!isAdmin && !isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      finalBranchId = branchId || null;
    } else {
      // USER reset
      finalPersonnelId = personnelId;
      finalBranchId = isGlobal ? null : (branchId || null);
    }

    await prisma.preference.deleteMany({
      where: {
        scope: resetScope,
        category,
        key,
        organizationId,
        branchId: finalBranchId,
        personnelId: finalPersonnelId,
        target,
      },
    });

    invalidateCacheForOrg(organizationId);
    return NextResponse.json({ success: true, message: `Reset ${resetScope} preference successfully` });
  } catch (error) {
    console.error("Preference DELETE Error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}