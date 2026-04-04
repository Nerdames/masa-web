import { NextRequest, NextResponse } from "next/server";
import prisma from "@/core/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { Role, Severity } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

/**
 * HELPER: Batch resolves IDs into Human-Readable Names across multiple tables.
 * Prevents N+1 query issues by grouping IDs by their Target Type.
 */
async function resolveEntityNames(logs: any[]) {
  const nameMap = new Map<string, string>();
  const categories: Record<string, string[]> = {};

  // 1. Group IDs by Target Type
  logs.forEach(log => {
    if (log.targetId && log.targetType) {
      if (!categories[log.targetType]) categories[log.targetType] = [];
      categories[log.targetType].push(log.targetId);
    }
  });

  // 2. Parallel Batch Fetching for different entities
  await Promise.all(Object.entries(categories).map(async ([type, ids]) => {
    const uniqueIds = Array.from(new Set(ids));
    
    try {
      switch (type) {
        case 'PERSONNEL':
          const staff = await prisma.authorizedPersonnel.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
          staff.forEach(s => nameMap.set(s.id, s.name));
          break;
        case 'BRANCH':
          const branches = await prisma.branch.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
          branches.forEach(b => nameMap.set(b.id, b.name));
          break;
        case 'PRODUCT':
          const products = await prisma.product.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
          products.forEach(p => nameMap.set(p.id, p.name));
          break;
        case 'CUSTOMER':
          const customers = await prisma.customer.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
          customers.forEach(c => nameMap.set(c.id, c.name));
          break;
      }
    } catch (e) {
      console.warn(`Could not resolve names for ${type}`);
    }
  }));

  return nameMap;
}

/**
 * CORE: Semantic Narrative Engine
 * Parses metadata to explain WHAT changed, not just that a change occurred.
 */
function generateNarrative(log: any, entityName: string | null) {
  const meta = (log.metadata as any) || {};
  const action = log.action.toUpperCase();
  const targetLabel = entityName || log.targetId || "System Entity";
  
  // A. Handle Common Patterns (CRUD)
  if (action.includes("CREATE")) return `Registered new ${log.targetType?.toLowerCase()}: ${targetLabel}`;
  if (action.includes("DELETE")) return `Archived ${log.targetType?.toLowerCase()}: ${targetLabel}`;
  
  // B. Handle Metadata Diffs (The "Intelligent" Part)
  if (meta.before && meta.after) {
    const changes = Object.keys(meta.after).filter(key => meta.before[key] !== meta.after[key]);
    
    if (changes.includes('status')) return `Changed status of ${targetLabel} to ${meta.after.status}`;
    if (changes.includes('role')) return `Updated ${targetLabel}'s access role to ${meta.after.role}`;
    if (changes.includes('quantity') || changes.includes('stock')) {
      return `Adjusted stock for ${targetLabel} (${meta.before.quantity ?? 0} → ${meta.after.quantity})`;
    }
    if (changes.length === 1) return `Updated ${changes[0]} for ${targetLabel}`;
    if (changes.length > 1) return `Modified multiple attributes for ${targetLabel}`;
  }

  // C. Fallback for specific POS/Financial actions
  if (action === "VOID_TRANSACTION") return `Voided transaction for ${targetLabel}`;
  if (action === "REFUND_PAYMENT") return `Processed a refund for ${targetLabel}`;

  return log.description || `${action.replace(/_/g, " ")} ${log.targetType || ''} ${targetLabel}`.toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRole = session.user.role as Role;
    const auth = authorize({ role: userRole, action: "READ", resource: RESOURCES.AUDIT });
    if (!auth.allowed) return NextResponse.json({ error: "Access Denied" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    // 1. Fetch Logs
    const rawLogs = await prisma.activityLog.findMany({
      where: { organizationId: session.user.organizationId, deletedAt: null },
      include: { personnel: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 2. Resolve Entity Names for Target IDs
    const resolvedNames = await resolveEntityNames(rawLogs);

    // 3. Process into Intelligent Packets
    const processed = rawLogs.map(log => {
      const entityName = resolvedNames.get(log.targetId || "") || null;
      
      return {
        id: log.id,
        timestamp: log.createdAt,
        severity: log.severity,
        critical: log.critical,
        
        // THE INTELLIGENT PAYLOAD
        message: generateNarrative(log, entityName),
        
        actor: {
          name: log.personnel?.name || "System",
          id: log.actorId,
          ip: log.ipAddress
        },
        
        context: {
          target: entityName || log.targetId,
          type: log.targetType,
          action: log.action,
          requestId: log.requestId
        },

        // Raw Diffing for the "Comparison Tool" in frontend
        diff: {
          before: (log.metadata as any)?.before || null,
          after: (log.metadata as any)?.after || null
        },
        
        integrity: {
          isValid: log.isChainValid,
          hash: log.hash?.substring(0, 8) + "..."
        }
      };
    });

    return NextResponse.json({ success: true, logs: processed });

  } catch (error) {
    console.error("[FORENSIC_API_ERROR]", error);
    return NextResponse.json({ error: "Failed to compile semantic audit data" }, { status: 500 });
  }
}