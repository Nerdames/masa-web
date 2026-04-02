import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { Role } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = session.user.organizationId;
    const userRole = session.user.role as Role;
    
    // STRICT RBAC: Only authorized roles can view the forensic ledger
    const auth = authorize({ role: userRole, action: "READ", resource: RESOURCES.AUDIT });
    if (!auth.allowed) return NextResponse.json({ error: "Access Denied" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const moduleFilter = searchParams.get("module") || "ALL";

    // 1. Fetch Raw Logs strictly from Schema
    const rawLogs = await prisma.activityLog.findMany({
      where: { 
        organizationId: orgId,
        deletedAt: null 
      },
      include: {
        personnel: {
          select: { name: true, role: true, email: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 2. Heuristic Chain-Link Engine (Finding Similar/Linked Events)
    const processedLogs: any[] = [];
    const chainMap = new Map<string, any[]>();

    rawLogs.forEach(log => {
      const meta = log.metadata as any || {};
      
      // Fallback Trace ID: Using safe fallbacks for IP to group heuristics
      const safeIp = log.ipAddress || "127.0.0.1";
      const heuristicTraceId = meta.traceId || 
        `HEURISTIC_${log.personnelId || 'SYS'}_${safeIp}_${new Date(log.createdAt).getHours()}`;

      if (!chainMap.has(heuristicTraceId)) {
        chainMap.set(heuristicTraceId, []);
      }
      chainMap.get(heuristicTraceId)!.push(log);
    });

    // 3. Assemble the Process Trace
    for (const [traceId, chain] of Array.from(chainMap.entries())) {
      chain.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      const triggerEvent = chain[0];
      const similarEvents = chain.slice(1);

      // Module Filtering Logic
      const isSecurity = triggerEvent.critical || /LOCK|LOGIN|PASSWORD|AUTH|ROLE/.test(triggerEvent.action);
      const isFinancial = /INVOICE|PAYMENT|REFUND|VOID|EXPENSE/.test(triggerEvent.action);
      const isInventory = /STOCK|PRODUCT|ADJUST|TRANSFER/.test(triggerEvent.action);

      let logModule = "SYSTEM";
      if (isSecurity) logModule = "SECURITY";
      else if (isFinancial) logModule = "FINANCIAL";
      else if (isInventory) logModule = "INVENTORY";

      if (moduleFilter !== "ALL" && logModule !== moduleFilter) continue;

      processedLogs.push({
        id: triggerEvent.id,
        traceId: traceId,
        action: triggerEvent.action,
        critical: triggerEvent.critical,
        createdAt: triggerEvent.createdAt,
        // FIX: Ensure IP and Device info always have a string fallback
        ipAddress: triggerEvent.ipAddress || "0.0.0.0",
        deviceInfo: triggerEvent.deviceInfo || "SYSTEM_PROCESS",
        metadata: triggerEvent.metadata,
        // FIX: Provide personnelId for frontend routing
        personnelId: triggerEvent.personnelId || "SYSTEM", 
        personnelName: triggerEvent.personnel?.name || "System Automated",
        personnelRole: triggerEvent.personnel?.role || "SYSTEM",
        module: logModule,
        similarEvents: similarEvents.map(se => ({
          id: se.id,
          action: se.action,
          critical: se.critical,
          createdAt: se.createdAt,
          metadata: se.metadata
        }))
      });
    }

    processedLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, logs: processedLogs });

  } catch (error) {
    console.error("[AUDIT_API_ERROR]", error);
    return NextResponse.json({ error: "Forensic compilation failed." }, { status: 500 });
  }
}