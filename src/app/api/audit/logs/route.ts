import { NextRequest, NextResponse } from "next/server";
import prisma from "@/infrastructure/prisma/client"; // Singleton database client
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/config"; // Infrastructure auth engine
import { Prisma, Role, Severity, ActorType, PermissionAction } from "@prisma/client";
import { authorize, RESOURCES } from "@/server/permissions/enforcer"; // Server permissions engine

// --- TYPE DEFINITIONS ---
// Enforces a strict contract for the high-speed terminal UI
interface AuditTracePacket {
  id: string;
  action: string;
  description: string;
  module: "SECURITY" | "FINANCIAL" | "INVENTORY" | "SYSTEM";
  severity: Severity;
  critical: boolean;
  
  // The "Who" & "By"
  actor: {
    id: string | null;
    type: ActorType;
    name: string;
    role: string;
    staffCode?: string;
  };

  // The "Where" & "From"
  context: {
    branchName: string;
    ipAddress: string;
    deviceInfo: string;
    locationContext?: string; // e.g., "Lagos, Nigeria" mapped via IP later
  };

  // The "What" & "Target"
  target: {
    id: string | null;
    type: string | null;
  };

  // The "When", "Why", & "How"
  telemetry: {
    createdAt: string;
    requestId: string;
    approvalId: string | null; // Trace back to managerial consent
    metadata: Record<string, any>;
  };

  // The "Was" & "Is" (State mutations)
  diff: {
    before: Prisma.JsonValue | null;
    after: Prisma.JsonValue | null;
  };

  // Fortress Integrity 
  integrity: {
    hash: string | null;
    previousHash: string | null;
    isChainValid: boolean;
  };

  correlatedLogs: Partial<AuditTracePacket>[];
}

export async function GET(req: NextRequest) {
  try {
    // 1. AUTHENTICATION (The "Who is asking")
    const session = await getServerSession(authOptions);

    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized access attempt logged." }, { status: 401 });
    }

    const orgId = session.user.organizationId;
    const userRole = session.user.role as Role;
    const requestedBranchId = req.nextUrl.searchParams.get("branchId");

    // 2. DUAL-LAYER AUTHORIZATION (Auth.ts Session -> Permissions.ts Fallback)
    // Check if dynamic permissions exist on the session, otherwise fallback to static RBAC map
    const sessionPermissions = (session.user as any).permissions?.[RESOURCES.AUDIT] || [];
    const hasDynamicAccess = sessionPermissions.includes("READ" as PermissionAction);
    
    const staticAuth = authorize({
      role: userRole,
      action: "READ",
      resource: RESOURCES.AUDIT,
    });

    if (!hasDynamicAccess && !staticAuth.allowed) {
      console.warn(`[SECURITY] Audit access denied for User:${session.user.id} Role:${userRole}`);
      return NextResponse.json({ error: "Insufficient cryptographic clearance." }, { status: 403 });
    }

    // 3. SANITIZED PARAMS & RATE LIMITING BOUNDS
    const { searchParams } = req.nextUrl;
    // Hard cap at 100 to prevent memory exhaustion on large trace chains
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 100); 
    const severityFilter = searchParams.get("severity");
    const cursor = searchParams.get("cursor");
    const query = searchParams.get("q");
    const actorId = searchParams.get("actorId");

    // 4. BUILD OPTIMIZED QUERY
    const whereClause: Prisma.ActivityLogWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(requestedBranchId && { branchId: requestedBranchId }),
      ...(actorId && { actorId }),
    };

    if (severityFilter && severityFilter !== "ALL" && Object.values(Severity).includes(severityFilter as Severity)) {
      whereClause.severity = severityFilter as Severity;
    }

    if (query) {
      const sanitizedQuery = query.trim();
      whereClause.OR = [
        { action: { contains: sanitizedQuery, mode: "insensitive" } },
        { description: { contains: sanitizedQuery, mode: "insensitive" } },
        { requestId: { equals: sanitizedQuery } }, // Exact match preferred for UUIDs
        { targetId: { equals: sanitizedQuery } },
        { hash: { equals: sanitizedQuery } },
        {
          personnel: {
            OR: [
              { name: { contains: sanitizedQuery, mode: "insensitive" } },
              { staffCode: { equals: sanitizedQuery } },
            ],
          },
        },
      ];
    }

    // 5. FETCH LEDGER SEED (O(1) Pagination via Cursor)
    const rawLogs = await prisma.activityLog.findMany({
      where: whereClause,
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      include: {
        personnel: { select: { name: true, role: true, staffCode: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let nextCursor: string | undefined = undefined;
    if (rawLogs.length > limit) {
      const nextItem = rawLogs.pop();
      nextCursor = nextItem!.id;
    }

    // 6. CHAIN-LINK COMPLETENESS ENGINE
    // Reconstruct the exact sequence of events across the distributed system for a single Request ID
    const requestIds = [...new Set(rawLogs
      .map((log) => log.requestId)
      .filter((id): id is string => id !== null && id.trim() !== "")
    )];

    // Protection: Only fetch missing hops if we have requestIds, bounded by a sane limit
    const missingCorrelatedLogs = requestIds.length > 0 
      ? await prisma.activityLog.findMany({
          where: {
            organizationId: orgId,
            requestId: { in: requestIds },
            id: { notIn: rawLogs.map((l) => l.id) },
          },
          take: 500, // Circuit breaker to prevent massive payload expansion
          include: {
            personnel: { select: { name: true, role: true, staffCode: true } },
            branch: { select: { name: true } },
          },
        })
      : [];

    const allRelevantLogs = [...rawLogs, ...missingCorrelatedLogs];

    // 7. FORENSIC GROUPING & ANALYSIS
    const chainMap = new Map<string, typeof allRelevantLogs>();
    const orderedTraceKeys: string[] = [];

    allRelevantLogs.forEach((log) => {
      // TraceKey prioritizes actual Request ID to group API hops. If null, treat as standalone.
      const traceKey = log.requestId || log.id;

      if (!chainMap.has(traceKey)) {
        chainMap.set(traceKey, []);
        if (rawLogs.some(r => r.id === log.id)) {
            orderedTraceKeys.push(traceKey); 
        }
      }
      chainMap.get(traceKey)!.push(log);
    });

    // 8. ASSEMBLE TRACE PACKETS
    const processedLogs: AuditTracePacket[] = Array.from(new Set(orderedTraceKeys)).map((traceKey) => {
      const chain = chainMap.get(traceKey)!;
      
      // Sort ascending to find the true origin request (the spark)
      chain.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const trigger = chain[0];
      const downstream = chain.slice(1);
      const meta = (trigger.metadata as Record<string, any>) || {};

      // Dynamic Module Classification
      const actionStr = trigger.action.toUpperCase();
      let moduleType: "SECURITY" | "FINANCIAL" | "INVENTORY" | "SYSTEM" = "SYSTEM";

      if (trigger.critical || /LOCK|LOGIN|AUTH|PERMISSION|ROLE|PASSWORD/.test(actionStr)) {
        moduleType = "SECURITY";
      } else if (/PAYMENT|INVOICE|REFUND|EXPENSE|NGN|TRANSACTION|ACCOUNT/.test(actionStr)) {
        moduleType = "FINANCIAL";
      } else if (/STOCK|PRODUCT|WAREHOUSE|ADJUST|TRANSFER|GRN|PO|UOM/.test(actionStr)) {
        moduleType = "INVENTORY";
      }

      return {
        id: trigger.id,
        action: trigger.action,
        description: trigger.description || "System action logged.",
        module: moduleType,
        severity: trigger.severity,
        critical: trigger.critical,

        actor: {
          id: trigger.actorId,
          type: trigger.actorType,
          name: trigger.personnel?.name || (trigger.actorType === "SYSTEM" ? "SYSTEM_CORE" : "UNKNOWN_ENTITY"),
          role: trigger.actorRole || trigger.personnel?.role || "SYSTEM",
          staffCode: trigger.personnel?.staffCode || undefined,
        },

        context: {
          branchName: trigger.branch?.name || "HQ/GLOBAL",
          ipAddress: trigger.ipAddress || "0.0.0.0",
          deviceInfo: trigger.deviceInfo || "INTERNAL_SERVICE",
          locationContext: trigger.ipAddress ? "Lagos, Nigeria (Defaulted Context)" : undefined, // Placeholder for IP Geo-resolution
        },

        target: {
          id: trigger.targetId,
          type: trigger.targetType,
        },

        telemetry: {
          createdAt: trigger.createdAt.toISOString(),
          requestId: trigger.requestId || traceKey,
          approvalId: trigger.approvalId || null, 
          metadata: meta,
        },

        diff: {
          before: trigger.before,
          after: trigger.after,
        },

        integrity: {
          hash: trigger.hash,
          previousHash: trigger.previousHash,
          // Basic check: Ensure hash exists if it's a critical transaction. 
          // In an advanced setup, you would re-verify the crypto-hash here.
          isChainValid: trigger.critical ? !!trigger.hash : true, 
        },

        // Map downstream hops into a simplified array for the UI to expand
        correlatedLogs: downstream.map((hop) => ({
          id: hop.id,
          action: hop.action,
          severity: hop.severity,
          critical: hop.critical,
          telemetry: {
            createdAt: hop.createdAt.toISOString(),
            requestId: hop.requestId || traceKey,
            approvalId: hop.approvalId,
            metadata: (hop.metadata as Record<string, any>) || {},
          },
        })),
      };
    });

    // Final safety sort: Absolute descending chronological order for the UI
    processedLogs.sort((a, b) => new Date(b.telemetry.createdAt).getTime() - new Date(a.telemetry.createdAt).getTime());

    return NextResponse.json({
      success: true,
      data: {
        logs: processedLogs,
        pagination: {
          nextCursor,
          hasMore: !!nextCursor,
          limit
        }
      }
    });

  } catch (error) {
    console.error("[FORENSIC_API_FATAL]", error);
    // Avoid leaking stack traces in production responses
    return NextResponse.json(
      { error: "Audit ledger compilation encountered an integrity exception." },
      { status: 500 }
    );
  }
}