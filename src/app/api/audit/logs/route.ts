import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { Prisma, Role, Severity } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = session.user.organizationId;
    const userRole = session.user.role as Role;

    // 1. STRICT RBAC: Ensure user has AUDIT READ permissions
    const auth = authorize({
      role: userRole,
      action: "READ",
      resource: RESOURCES.AUDIT,
    });

    if (!auth.allowed) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const severityFilter = searchParams.get("severity") || "ALL";
    const cursor = searchParams.get("cursor");
    const query = searchParams.get("q");

    // 2. Build Query Filters for the specific Organization
    const whereClause: Prisma.ActivityLogWhereInput = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (severityFilter !== "ALL") {
      whereClause.severity = severityFilter as Severity;
    }

    if (query) {
      whereClause.OR = [
        { action: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { requestId: { contains: query, mode: "insensitive" } },
        { targetId: { contains: query, mode: "insensitive" } },
        { hash: { contains: query, mode: "insensitive" } },
        {
          personnel: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { staffCode: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    // 3. Fetch Raw Ledger Data strictly from Schema (with Pagination)
    const rawLogs = await prisma.activityLog.findMany({
      where: whereClause,
      take: limit + 1, // Fetch +1 to determine if there's a next page
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor itself
      }),
      include: {
        personnel: {
          select: { name: true, role: true, staffCode: true },
        },
        branch: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 4. Resolve Pagination
    let nextCursor: string | undefined = undefined;
    if (rawLogs.length > limit) {
      const nextItem = rawLogs.pop(); // Remove the extra item
      nextCursor = nextItem!.id;
    }

    // 5. Chain-Link Completeness Engine
    // If we paginated into the middle of a request chain, we need to fetch the rest of the hops
    // so the frontend packet isn't fragmented.
    const requestIds = rawLogs
      .map((log) => log.requestId)
      .filter((id): id is string => id !== null && id.trim() !== "");

    const missingCorrelatedLogs = requestIds.length > 0 
      ? await prisma.activityLog.findMany({
          where: {
            organizationId: orgId,
            requestId: { in: requestIds },
            id: { notIn: rawLogs.map((l) => l.id) }, // Only fetch what we missed
          },
          include: {
            personnel: { select: { name: true, role: true, staffCode: true } },
            branch: { select: { name: true } },
          },
        })
      : [];

    const allRelevantLogs = [...rawLogs, ...missingCorrelatedLogs];

    // 6. Forensic Processing & Grouping
    const chainMap = new Map<string, typeof allRelevantLogs>();
    const orderedTraceKeys: string[] = [];

    allRelevantLogs.forEach((log) => {
      // TraceKey prioritizes actual Request ID. If null, log is standalone (prevent massive null-grouping)
      const traceKey = log.requestId || log.id;

      if (!chainMap.has(traceKey)) {
        chainMap.set(traceKey, []);
        // Only track keys from the original paginated fetch to maintain cursor ordering
        if (rawLogs.some(r => r.id === log.id)) {
            orderedTraceKeys.push(traceKey); 
        }
      }
      chainMap.get(traceKey)!.push(log);
    });

    // 7. Assemble the Process Trace Packets exactly matching the Frontend Interface
    const processedLogs = Array.from(new Set(orderedTraceKeys)).map((traceKey) => {
      const chain = chainMap.get(traceKey)!;
      
      // Sort chain by time (ascending) to identify the true trigger event vs downstream hops
      chain.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const trigger = chain[0];
      const downstream = chain.slice(1);
      const meta = (trigger.metadata as any) || {};

      // Determine Module Classification based on Action String
      const actionStr = trigger.action.toUpperCase();
      let moduleType: "SECURITY" | "FINANCIAL" | "INVENTORY" | "SYSTEM" = "SYSTEM";

      if (trigger.critical || /LOCK|LOGIN|AUTH|PERMISSION|ROLE|PASSWORD/.test(actionStr)) {
        moduleType = "SECURITY";
      } else if (/PAYMENT|INVOICE|REFUND|EXPENSE|NGN|TRANSACTION/.test(actionStr)) {
        moduleType = "FINANCIAL";
      } else if (/STOCK|PRODUCT|WAREHOUSE|ADJUST|TRANSFER|GRN|PO/.test(actionStr)) {
        moduleType = "INVENTORY";
      }

      return {
        id: trigger.id,
        action: trigger.action,
        description: trigger.description || "No description provided.",
        module: moduleType,
        severity: trigger.severity,
        critical: trigger.critical,
        createdAt: trigger.createdAt.toISOString(),

        // Originator Details (Aligned with UI Badges)
        actorId: trigger.actorId,
        actorType: trigger.actorType,
        personnelName: trigger.personnel?.name || (trigger.actorType === "SYSTEM" ? "SYSTEM_AUTOMATED" : "Unknown"),
        personnelRole: trigger.actorRole || trigger.personnel?.role || "SYSTEM",
        personnelCode: trigger.personnel?.staffCode || undefined,
        branchName: trigger.branch?.name || "HQ/GLOBAL",

        // Target Resource Mapping
        target: {
          id: trigger.targetId || null,
          type: trigger.targetType || null,
          branch: trigger.branch?.name || "GLOBAL",
        },

        // Telemetry
        requestId: trigger.requestId || traceKey,
        ipAddress: trigger.ipAddress || "0.0.0.0",
        deviceInfo: trigger.deviceInfo || "INTERNAL_SERVICE",

        // State Diffing Logic (Mapped straight to Schema)
        diff: {
          before: trigger.before || null,
          after: trigger.after || null,
        },

        // Fortress Integrity Verification Data
        integrity: {
          hash: trigger.hash || null,
          previousHash: trigger.previousHash || null,
          isChainValid: !!trigger.hash, // Simplistic validation, expand based on crypto needs
        },

        metadata: meta,

        // Downstream Correlated Hops
        correlatedLogs: downstream.map((hop) => ({
          id: hop.id,
          action: hop.action,
          description: hop.description,
          severity: hop.severity,
          critical: hop.critical,
          createdAt: hop.createdAt.toISOString(),
          metadata: (hop.metadata as any) || {},
        })),
      };
    });

    // 8. Final safety sort to ensure absolute descending chronological order
    processedLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      logs: processedLogs,
      nextCursor,
    });
  } catch (error) {
    console.error("[FORENSIC_API_ERROR]", error);
    return NextResponse.json(
      { error: "Audit ledger compilation failed." },
      { status: 500 }
    );
  }
}