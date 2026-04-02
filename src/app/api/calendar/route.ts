// app/api/calendar/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, Role, CriticalAction, ApprovalStatus } from "@prisma/client";
import { ROLE_WEIGHT, ACTION_REQUIREMENTS } from "@/core/lib/permission";
import { applyActionDirectly } from "@/core/lib/actions";
import { createNotification } from "@/core/lib/notifications";

/**
 * Calendar route (single-instance, no Redis)
 *
 * - GET: validated query, optional types filter, conditional GET via Last-Modified
 * - POST: validated body, HMAC support, approval/execution/fallback logging
 *
 * Notes:
 * - Uses in-memory maps for rate limiting and short cache. Suitable for single-instance deployments.
 * - If you run multiple instances, replace the in-memory maps with a shared store (Redis, etc.).
 */

/* -----------------------
   Config & validation
   ----------------------- */

const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";
const MAX_META_BYTES = 32 * 1024; // 32KB
const MAX_ACTION_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 10_000; // 10s sliding window
const RATE_LIMIT_MAX = 30;
const CACHE_TTL_MS = 30 * 1000; // 30s in-memory cache for GET results

const getQuerySchema = z.object({
  start: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid start date" }),
  end: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid end date" }),
  types: z.string().optional(),
  limit: z.coerce.number().optional().default(200).transform((n) => Math.min(Math.max(n, 1), 1000)),
  cursor: z.string().optional(),
  tz: z.string().optional(),
});

const postBodySchema = z.object({
  action: z.string().min(1).max(MAX_ACTION_LENGTH),
  organizationId: z.string().optional(),
  branchId: z.string().optional(),
  personnelId: z.string().optional(),
  approvalId: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
  systemHmac: z.string().optional(),
});

/* -----------------------
   In-memory helpers (single-instance)
   ----------------------- */

// Sliding-window rate limiter map: key -> timestamps[]
const rateMap = new Map<string, number[]>();

function checkRateLimitInMemory(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = rateMap.get(key) ?? [];
  const filtered = timestamps.filter((t) => t > windowStart);
  if (filtered.length >= RATE_LIMIT_MAX) {
    rateMap.set(key, filtered);
    return false;
  }
  filtered.push(now);
  rateMap.set(key, filtered);
  return true;
}

// Simple in-memory cache for GET results: key -> { ts, data, lastModified }
const cacheMap = new Map<
  string,
  { ts: number; data: any; lastModified?: string; cursor?: string | null }
>();

function setCache(key: string, payload: { data: any; lastModified?: string; cursor?: string | null }) {
  cacheMap.set(key, { ts: Date.now(), data: payload.data, lastModified: payload.lastModified, cursor: payload.cursor ?? null });
}

function getCache(key: string) {
  const entry = cacheMap.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cacheMap.delete(key);
    return null;
  }
  return entry;
}

/* -----------------------
   Utilities
   ----------------------- */

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

function jsonError(message: string, status = 400) {
  return jsonResponse({ success: false, message }, status);
}

function verifySystemHmac(payload: string, hmac: string): boolean {
  if (!SYSTEM_HMAC_SECRET) return false;
  const mac = crypto.createHmac("sha256", SYSTEM_HMAC_SECRET).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(hmac));
  } catch {
    return false;
  }
}

function buildCacheKey(params: Record<string, string | number | undefined>) {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? "")}`);
  return `calendar:get:${parts.join("&")}`;
}

function dayKey(d: Date) {
  return formatISO(d);
}

function formatISO(d: Date) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/* Lightweight async notification wrapper (non-blocking) */
async function enqueueNotificationsSafe(payload: any) {
  try {
    await createNotification(payload);
  } catch (err) {
    console.error("[NOTIFY_ERR]", err);
    // For single-instance, optionally push to a durable queue here
  }
}

/* -----------------------
   GET handler
   ----------------------- */

import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const raw = {
      start: url.searchParams.get("start") ?? "",
      end: url.searchParams.get("end") ?? "",
      types: url.searchParams.get("types") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      tz: url.searchParams.get("tz") ?? undefined,
    };

    const parsed = getQuerySchema.safeParse(raw);
    if (!parsed.success) return jsonError("Invalid query: " + parsed.error.message, 400);
    const { start, end, types, limit } = parsed.data;

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate > endDate) return jsonError("start must be <= end", 400);

    const orgId = session.user.organizationId;
    if (!orgId) return jsonError("Organization context missing", 400);
    const branchId = session.user.branchId ?? undefined;

    // Rate limit per user/org/ip
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const rlKey = `calendar_get:${orgId}:${ip}`;
    if (!checkRateLimitInMemory(rlKey)) return jsonError("Too many requests", 429);

    // Build cache key and try in-memory cache
    const cacheKey = buildCacheKey({ orgId, start, end, types, limit, branchId });
    const cached = getCache(cacheKey);
    if (cached) {
      const headers = cached.lastModified ? { "Last-Modified": cached.lastModified } : undefined;
      return NextResponse.json({ success: true, data: cached.data, cursor: cached.cursor }, { status: 200, headers });
    }

    // Fetch data in parallel (optimized selects)
    const [logs, approvals, stockMoves, purchaseOrders, expenses] = await Promise.all([
      prisma.activityLog.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: startDate, lte: endDate } },
        select: { id: true, action: true, createdAt: true, critical: true, metadata: true },
      }),
      prisma.approvalRequest.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: startDate, lte: endDate } },
        select: { id: true, actionType: true, status: true, createdAt: true, targetId: true },
      }),
      prisma.stockMovement.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: startDate, lte: endDate } },
        select: { id: true, type: true, quantity: true, createdAt: true, branchProductId: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: startDate, lte: endDate } },
        select: { id: true, poNumber: true, status: true, createdAt: true, totalAmount: true },
      }),
      prisma.expense.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), date: { gte: startDate, lte: endDate } },
        select: { id: true, reference: true, amount: true, date: true, category: true },
      }),
    ]);

    const formattedEvents = [
      ...logs.map((l) => ({
        id: l.id,
        type: l.critical ? "SECURITY" : "LOG",
        title: (l.action || "").replace(/_/g, " "),
        date: l.createdAt instanceof Date ? l.createdAt.toISOString() : new Date(l.createdAt).toISOString(),
        metadata: l.metadata ?? null,
      })),
      ...approvals.map((a) => ({
        id: a.id,
        type: "APPROVAL",
        title: `${a.actionType} [${a.status}]`,
        date: a.createdAt instanceof Date ? a.createdAt.toISOString() : new Date(a.createdAt).toISOString(),
        metadata: { targetId: a.targetId },
      })),
      ...stockMoves.map((s) => ({
        id: s.id,
        type: "STOCK",
        title: `${s.type} MOVE (${s.quantity})`,
        date: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString(),
        metadata: { branchProductId: s.branchProductId },
      })),
      ...purchaseOrders.map((p) => ({
        id: p.id,
        type: "PO",
        title: `PO #${p.poNumber} [${p.status}]`,
        date: p.createdAt instanceof Date ? p.createdAt.toISOString() : new Date(p.createdAt).toISOString(),
        metadata: { totalAmount: p.totalAmount },
      })),
      ...expenses.map((e) => ({
        id: e.id,
        type: "EXPENSE",
        title: `EXP: ${e.reference ?? "N/A"} • ₦${e.amount}`,
        date: e.date instanceof Date ? e.date.toISOString() : new Date(e.date).toISOString(),
        metadata: { category: e.category },
      })),
    ];

    // Optional types filter
    const typeSet = types ? new Set(types.split(",").map((t) => t.trim().toUpperCase())) : null;
    const filtered = typeSet ? formattedEvents.filter((ev) => typeSet.has(ev.type)) : formattedEvents;

    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Simple cursor/limit handling
    const result = filtered.slice(0, limit);
    const nextCursor = filtered.length > limit ? result[result.length - 1].id : null;

    // Compute lastModified as the newest createdAt among fetched logs (coarse)
    const newest = formattedEvents[0];
    const lastModified = newest ? new Date(newest.date).toUTCString() : new Date().toUTCString();

    // Cache in-memory
    setCache(cacheKey, { data: result, lastModified, cursor: nextCursor });

    const headers = { "Last-Modified": lastModified };
    return NextResponse.json({ success: true, data: result, cursor: nextCursor }, { status: 200, headers });
  } catch (err) {
    console.error("[CALENDAR_GET_FATAL]", err);
    return jsonError("Internal server error", 500);
  }
}

/* -----------------------
   POST handler
   ----------------------- */

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
    const device = req.headers.get("user-agent") ?? "unknown";

    // Rate limiting per IP (in-memory)
    if (!checkRateLimitInMemory(`log_post:${ip}`)) return jsonError("Too many requests", 429);

    const rawBody = await req.text();
    let jsonBody: unknown;
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = postBodySchema.safeParse(jsonBody);
    if (!parsed.success) return jsonError("Invalid payload schema", 400);

    const { action, organizationId, branchId, personnelId, approvalId, meta, systemHmac } = parsed.data;

    // Metadata size check
    if (meta) {
      const metaStr = JSON.stringify(meta);
      if (Buffer.byteLength(metaStr, "utf8") > MAX_META_BYTES) return jsonError("Meta payload too large", 413);
    }

    const isVerifiedSystem = systemHmac ? verifySystemHmac(rawBody, systemHmac) : false;
    const session = await getServerSession(authOptions);
    const requester = session?.user;

    if (!requester && !isVerifiedSystem) return jsonError("Unauthorized access", 401);

    const targetOrgId = organizationId ?? requester?.organizationId;
    if (!targetOrgId) return jsonError("Organization Context Missing", 400);

    // Authorization & critical action checks
    const isCriticalAction = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCriticalAction ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = requester?.role as Role | undefined;
    const requesterMeetsRequirement =
      isVerifiedSystem || (!!requester && (!requiredRole || (userRole && ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole])));

    // CASE 1: Critical action requires approval (requester exists but doesn't meet requirement)
    if (isCriticalAction && requester && !requesterMeetsRequirement) {
      const approvalResult = await prisma.$transaction(async (tx) => {
        const approval = await tx.approvalRequest.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            requesterId: requester.id,
            actionType: action as CriticalAction,
            changes: (meta as Prisma.InputJsonValue) ?? {},
            status: ApprovalStatus.PENDING,
          },
        });

        await tx.activityLog.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            personnelId: requester.id,
            action: `REQUEST_APPROVAL_${action}`,
            critical: false,
            ipAddress: ip,
            deviceInfo: device,
            metadata: {
              approvalId: approval.id,
              payload: meta ?? null,
            } as Prisma.InputJsonValue,
            approvalId: approval.id,
          },
        });

        return approval;
      });

      // Async notification (non-blocking)
      enqueueNotificationsSafe({
        title: "Approval Required",
        message: `${requester.name} requested: ${action}`,
        type: "APPROVAL_REQUIRED",
        organizationId: targetOrgId,
        branchId: branchId ?? null,
        approvalId: approvalResult.id,
      });

      return NextResponse.json({ success: true, approvalId: approvalResult.id, status: "PENDING" }, { status: 202 });
    }

    // CASE 2: Critical action and requester meets requirement (execute directly)
    if (isCriticalAction && requesterMeetsRequirement) {
      const executionResult = await prisma.$transaction(async (tx) => {
        const opResult = await applyActionDirectly(
          tx,
          action,
          personnelId ?? "",
          (meta as Record<string, unknown>) ?? {},
          requester?.id ?? "SYSTEM",
          targetOrgId,
          branchId ?? null
        );

        await tx.activityLog.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            personnelId: requester?.id ?? null,
            action: `EXECUTE_${action}`,
            critical: true,
            ipAddress: ip,
            deviceInfo: device,
            metadata: { status: "EXECUTED", changes: meta ?? {} } as Prisma.InputJsonValue,
          },
        });

        return opResult;
      });

      enqueueNotificationsSafe({
        title: "Action Executed",
        message: `${requester?.name ?? "System"} performed: ${action}`,
        type: "SYSTEM",
        organizationId: targetOrgId,
        branchId: branchId ?? null,
      });

      return NextResponse.json({ success: true, result: executionResult }, { status: 200 });
    }

    // CASE 3: Standard logging fallback
    const logEntry = await prisma.activityLog.create({
      data: {
        action,
        organizationId: targetOrgId,
        branchId: branchId ?? null,
        personnelId: personnelId ?? requester?.id ?? null,
        approvalId: approvalId ?? null,
        critical: false,
        ipAddress: ip,
        deviceInfo: device,
        metadata: (meta as Prisma.InputJsonValue) ?? null,
      },
    });

    // Invalidate in-memory cache entries that might be stale (coarse invalidation)
    // Remove any cache entries for this org (simple approach)
    for (const key of Array.from(cacheMap.keys())) {
      if (key.includes(`orgId=${targetOrgId}`)) cacheMap.delete(key);
    }

    // Optionally notify listeners
    enqueueNotificationsSafe({
      title: "Activity Logged",
      message: `Action logged: ${action}`,
      type: "SYSTEM",
      organizationId: targetOrgId,
      branchId: branchId ?? null,
      id: logEntry.id,
    });

    return NextResponse.json({ success: true, id: logEntry.id }, { status: 201 });
  } catch (err) {
    console.error("[LOG_POST_FATAL]", err);
    return jsonError("Internal server error during processing", 500);
  }
}
