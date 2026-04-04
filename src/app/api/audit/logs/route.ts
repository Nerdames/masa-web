import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { Role, Severity } from "@prisma/client";
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
      resource: RESOURCES.AUDIT 
    });
    
    if (!auth.allowed) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const severityFilter = searchParams.get("severity") || "ALL";

    // 2. Build Query Filters for the specific Organization
    const whereClause: any = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (severityFilter !== "ALL") {
      whereClause.severity = severityFilter as Severity;
    }

    // 3. Fetch Raw Ledger Data strictly from Schema
    const rawLogs = await prisma.activityLog.findMany({
      where: whereClause,
      include: {
        personnel: {
          select: { name: true, role: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 4. Forensic Processing & Heuristic Chain-Link Engine
    const chainMap = new Map<string, any[]>();
    
    rawLogs.forEach(log => {
      const meta = (log.metadata as any) || {};
      
      // Correlation Logic: Use native RequestID, fallback to metadata traceId, then safe temporal-actor fallback
      const safeIp = log.ipAddress || "0.0.0.0";
      const traceKey = log.requestId || meta.traceId || 
        `HEURISTIC_${log.actorId || 'SYS'}_${safeIp}_${new Date(log.createdAt).getHours()}`;

      if (!chainMap.has(traceKey)) {
        chainMap.set(traceKey, []);
      }
      chainMap.get(traceKey)!.push(log);
    });

    // 5. Assemble the Process Trace Packets
    const processedLogs = Array.from(chainMap.entries()).map(([traceId, chain]) => {
      // Sort chain by time (ascending) to identify the true trigger event
      chain.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
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
      } else if (/STOCK|PRODUCT|WAREHOUSE|ADJUST|TRANSFER/.test(actionStr)) {
        moduleType = "INVENTORY";
      }

      // Exact Mapping to the Frontend UI ForensicPacket Interface
      return {
        id: trigger.id,
        action: trigger.action,
        description: trigger.description || "No description provided.",
        module: moduleType,
        severity: trigger.severity,
        critical: trigger.critical,
        createdAt: trigger.createdAt.toISOString(),
        
        // Originator Details
        actorId: trigger.actorId,
        actorType: trigger.actorType,
        personnelName: trigger.personnel?.name || "System Automated",
        personnelRole: trigger.actorRole || trigger.personnel?.role || "SYSTEM",
        
        // Telemetry
        requestId: trigger.requestId || traceId,
        ipAddress: trigger.ipAddress || "0.0.0.0",
        deviceInfo: trigger.deviceInfo || "INTERNAL_SERVICE",
        
        // Target Resource Mapping
        target: {
          id: trigger.targetId || null,
          type: trigger.targetType || null
        },

        // State Diffing Logic (Extracted from metadata blob)
        diff: {
          before: meta.before || null,
          after: meta.after || null
        },

        // Fortress Integrity Verification Data
        integrity: {
          hash: trigger.hash || null,
          previousHash: trigger.previousHash || null,
          isChainValid: trigger.isChainValid ?? true
        },

        metadata: meta,

        // Downstream Correlated Hops (Request Chain)
        correlatedLogs: downstream.map(hop => ({
          id: hop.id,
          action: hop.action,
          description: hop.description,
          severity: hop.severity,
          critical: hop.critical,
          createdAt: hop.createdAt.toISOString(),
          metadata: (hop.metadata as any) || {}
        }))
      };
    });

    // 6. Final sort to ensure the latest "Traces" appear at the top of the terminal
    processedLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ 
      success: true, 
      logs: processedLogs 
    });

  } catch (error) {
    console.error("[FORENSIC_API_ERROR]", error);
    return NextResponse.json(
      { error: "Audit ledger compilation failed." }, 
      { status: 500 }
    );
  }
}