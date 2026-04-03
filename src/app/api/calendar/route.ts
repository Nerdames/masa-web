// app/api/calendar/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/core/lib/auth";
import crypto from "crypto";
import { z } from "zod";
import { 
  Prisma, 
  Role, 
  CriticalAction, 
  ApprovalStatus, 
  ActorType, 
  Severity 
} from "@prisma/client";
import { ROLE_WEIGHT, ACTION_REQUIREMENTS } from "@/core/lib/permission";
import { applyActionDirectly } from "@/core/lib/actions";
import { createNotification } from "@/core/lib/notifications";
import { v4 as uuidv4 } from "uuid";

/* -----------------------
   Config & Validation
   ----------------------- */

const SYSTEM_HMAC_SECRET = process.env.LOG_SYSTEM_HMAC_SECRET || "";
const RATE_LIMIT_WINDOW_MS = 10_000; 
const RATE_LIMIT_MAX = 50;

const getQuerySchema = z.object({
  start: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  end: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  types: z.string().optional(),
  limit: z.coerce.number().optional().default(200).transform((n) => Math.min(Math.max(n, 1), 1000)),
  branchId: z.string().optional(),
});

const postBodySchema = z.object({
  action: z.string().min(1).max(200),
  organizationId: z.string().optional(),
  branchId: z.string().optional(),
  personnelId: z.string().optional(), 
  approvalId: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
  targetId: z.string().optional(),
  targetType: z.string().optional(),
  severity: z.nativeEnum(Severity).optional(),
  systemHmac: z.string().optional(),
});

/* -----------------------
   Helpers
   ----------------------- */

const rateMap = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateMap.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateMap.set(key, timestamps);
  return true;
}

function verifySystemHmac(payload: string, hmac: string): boolean {
  if (!SYSTEM_HMAC_SECRET) return false;
  const mac = crypto.createHmac("sha256", SYSTEM_HMAC_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(hmac));
}

const jsonError = (message: string, status = 400) => 
  NextResponse.json({ success: false, message }, { status });

/* -----------------------
   GET Handler (Enriched)
   ----------------------- */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const parsed = getQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return jsonError("Invalid query", 400);

    const { start, end, types, limit, branchId: queryBranchId } = parsed.data;
    const orgId = session.user.organizationId;
    const branchId = queryBranchId ?? session.user.branchId ?? undefined;

    if (!checkRateLimit(`cal_get:${orgId}:${session.user.id}`)) return jsonError("Too many requests", 429);

    // Concurrent fetch with selective joins for "Frozen State" display
    const [logs, approvals, stockMoves, pos, expenses] = await Promise.all([
      prisma.activityLog.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: new Date(start), lte: new Date(end) } },
        include: { personnel: { select: { name: true } } },
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.approvalRequest.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: new Date(start), lte: new Date(end) } },
        include: { requester: { select: { name: true } }, approver: { select: { name: true } } },
      }),
      prisma.stockMovement.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: new Date(start), lte: new Date(end) } },
        include: { product: { select: { name: true } }, handledBy: { select: { name: true } } },
      }),
      prisma.purchaseOrder.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), createdAt: { gte: new Date(start), lte: new Date(end) } },
        include: { vendor: { select: { name: true } }, createdBy: { select: { name: true } } },
      }),
      prisma.expense.findMany({
        where: { organizationId: orgId, ...(branchId ? { branchId } : {}), date: { gte: new Date(start), lte: new Date(end) } },
        include: { category: { select: { name: true } }, createdBy: { select: { name: true } } },
      }),
    ]);

    const formattedEvents = [
      ...logs.map((l) => ({
        id: l.id,
        type: l.critical ? "SECURITY" : "LOG",
        title: l.action.replace(/_/g, " "),
        displayMessage: `${l.personnel?.name ?? 'System'}: ${l.description || l.action}`,
        date: l.createdAt.toISOString(),
        severity: l.severity,
        metadata: { ...((l.metadata as object) || {}), actorName: l.personnel?.name },
      })),
      ...approvals.map((a) => ({
        id: a.id,
        type: "APPROVAL",
        title: `REQ: ${a.actionType}`,
        displayMessage: `${a.requester.name} requested approval for ${a.actionType.toLowerCase()} (${a.status})`,
        date: a.createdAt.toISOString(),
        metadata: { status: a.status, approver: a.approver?.name },
      })),
      ...stockMoves.map((s) => ({
        id: s.id,
        type: "STOCK",
        title: `${s.type} Adjustment`,
        displayMessage: `${s.handledBy?.name ?? 'System'} adjusted ${s.quantity} units of ${s.product.name}`,
        date: s.createdAt.toISOString(),
        metadata: { reason: s.reason },
      })),
      ...pos.map((p) => ({
        id: p.id,
        type: "PO",
        title: `PO #${p.poNumber}`,
        displayMessage: `PO #${p.poNumber} (${p.status}) created by ${p.createdBy.name} for ${p.vendor.name}`,
        date: p.createdAt.toISOString(),
        metadata: { amount: p.totalAmount },
      })),
      ...expenses.map((e) => ({
        id: e.id,
        type: "EXPENSE",
        title: `EXP: ${e.category.name}`,
        displayMessage: `Expense of ₦${e.amount} logged by ${e.createdBy.name} (${e.category.name})`,
        date: e.date.toISOString(),
        metadata: { status: e.status },
      })),
    ];

    // Filter by type if requested
    const typeSet = types ? new Set(types.split(",").map(t => t.trim().toUpperCase())) : null;
    const filtered = typeSet ? formattedEvents.filter(ev => typeSet.has(ev.type)) : formattedEvents;
    
    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ success: true, data: filtered.slice(0, limit) });
  } catch (err) {
    console.error("[CALENDAR_GET_FATAL]", err);
    return jsonError("Internal Server Error", 500);
  }
}

/* -----------------------
   POST Handler (Enriched)
   ----------------------- */

export async function POST(req: NextRequest) {
  const requestId = uuidv4();
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const device = req.headers.get("user-agent") ?? "unknown";

    const rawBody = await req.text();
    const parsed = postBodySchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return jsonError("Invalid payload", 400);

    const { action, organizationId, branchId, personnelId, meta, targetId, targetType, severity, systemHmac } = parsed.data;

    const isVerifiedSystem = systemHmac ? verifySystemHmac(rawBody, systemHmac) : false;
    const session = await getServerSession(authOptions);
    const requester = session?.user;

    if (!requester && !isVerifiedSystem) return jsonError("Unauthorized", 401);

    const targetOrgId = organizationId ?? requester?.organizationId;
    if (!targetOrgId) return jsonError("Organization context missing", 400);

    // Resolve Actor Name for forensic description
    const actor = personnelId 
      ? await prisma.authorizedPersonnel.findUnique({ where: { id: personnelId }, select: { name: true, role: true } })
      : requester;

    const actorName = actor?.name ?? "System";
    const forensicDescription = `${actorName} initiated ${action.toLowerCase().replace(/_/g, " ")}`;

    const isCritical = Object.values(CriticalAction).includes(action as CriticalAction);
    const requiredRole = isCritical ? ACTION_REQUIREMENTS[action as CriticalAction] : null;
    const userRole = (actor as any)?.role as Role;
    const meetsReq = isVerifiedSystem || (!requiredRole || (userRole && ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole]));

    // CASE 1: Approval Workflow
    if (isCritical && requester && !meetsReq) {
      const approval = await prisma.$transaction(async (tx) => {
        const reqDoc = await tx.approvalRequest.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            requesterId: requester.id,
            actionType: action as CriticalAction,
            changes: (meta as Prisma.InputJsonValue) ?? {},
            status: ApprovalStatus.PENDING,
            targetId,
            targetType,
          },
        });

        await tx.activityLog.create({
          data: {
            organizationId: targetOrgId,
            branchId: branchId ?? null,
            actorId: requester.id,
            actorType: ActorType.USER,
            actorRole: userRole,
            action: `REQUEST_APPROVAL_${action}`,
            description: `Requested approval for ${action}`,
            severity: Severity.MEDIUM,
            requestId,
            ipAddress: ip,
            deviceInfo: device,
            metadata: { approvalId: reqDoc.id, originalMeta: meta } as Prisma.InputJsonValue,
          },
        });
        return reqDoc;
      });

      return NextResponse.json({ success: true, approvalId: approval.id, status: "PENDING" }, { status: 202 });
    }

    // CASE 2: Direct Execution or Standard Log
    const log = await prisma.activityLog.create({
      data: {
        organizationId: targetOrgId,
        branchId: branchId ?? null,
        actorId: personnelId ?? requester?.id ?? null,
        actorType: requester ? ActorType.USER : ActorType.SYSTEM,
        actorRole: userRole ?? null,
        action,
        description: forensicDescription,
        severity: severity ?? (isCritical ? Severity.HIGH : Severity.LOW),
        critical: isCritical,
        requestId,
        ipAddress: ip,
        deviceInfo: device,
        metadata: { ...meta, resolvedName: actorName } as Prisma.InputJsonValue,
        targetId,
        targetType,
      },
    });

    // If critical and authorized, execute side effects
    if (isCritical && meetsReq) {
      await applyActionDirectly(prisma, action, personnelId ?? "", meta ?? {}, requester?.id ?? "SYSTEM", targetOrgId, branchId ?? null);
    }

    return NextResponse.json({ success: true, id: log.id, requestId }, { status: 201 });
  } catch (err) {
    console.error("[CALENDAR_POST_FATAL]", err);
    return jsonError("Internal Server Error", 500);
  }
}