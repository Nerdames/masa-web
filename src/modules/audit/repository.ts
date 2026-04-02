// src/modules/audit/repository.ts
import prisma from "@/core/lib/prisma";
import { Prisma, Role } from "@prisma/client";

type GlobalLogsParams = {
  organizationId: string;
  branchId?: string | null;
  role?: Role | null;
  limit?: number;
  offset?: number;
  isCritical?: boolean | null;
  startDate?: Date | null;
  endDate?: Date | null;
  action?: string | null;
  search?: string | null;
  status?: string | null;
  personnelId?: string | null;
};

/**
 * AuditRepository
 *
 * Encapsulates all read-only access patterns for the ActivityLog table.
 * This module intentionally exposes only SELECT-style operations (no updates/deletes).
 */
export const AuditRepository = {
  /**
   * Fetches the master activity log with heavy filtering for Auditor/Admin roles.
   * Optimized for the Fortress Management interface.
   */
  async getGlobalLogs(params: GlobalLogsParams) {
    const {
      organizationId,
      branchId,
      limit = 50,
      offset = 0,
      isCritical,
      startDate,
      endDate,
      action,
      search,
      status,
      personnelId,
    } = params;

    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      ...(isCritical !== undefined && isCritical !== null ? { critical: isCritical } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(personnelId ? { personnelId } : {}),
      ...(status ? { meta: { path: ["status"], equals: status } as any } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { ipAddress: { contains: search, mode: "insensitive" } },
              { deviceInfo: { contains: search, mode: "insensitive" } },
              // JSON search support varies by provider; keep a safe fallback
              // Prisma's JSON filtering differs across DBs; this is a best-effort pattern.
              { meta: { path: [], string_contains: search } as any },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    // Execute query and count in parallel for pagination support in DataTables
    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          personnel: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              staffCode: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
          approvalRequest: {
            select: {
              id: true,
              status: true,
              actionType: true,
              approver: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return { data, total };
  },

  /**
   * Export logs matching filters.
   * Returns raw rows suitable for CSV/JSON export.
   * Caps results to a safe maximum to avoid huge payloads.
   */
  async exportLogs(params: {
    organizationId: string;
    branchId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    action?: string | null;
    search?: string | null;
    personnelId?: string | null;
    limit?: number; // caller may request but repository enforces a hard cap
  }) {
    const {
      organizationId,
      branchId,
      startDate,
      endDate,
      action,
      search,
      personnelId,
      limit = 10000,
    } = params;

    const hardCap = Math.min(limit, 10000);

    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(personnelId ? { personnelId } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { ipAddress: { contains: search, mode: "insensitive" } },
              { deviceInfo: { contains: search, mode: "insensitive" } },
              { meta: { path: [], string_contains: search } as any },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.activityLog.findMany({
      where,
      include: {
        personnel: { select: { id: true, name: true, role: true, staffCode: true } },
      },
      orderBy: { createdAt: "desc" },
      take: hardCap,
    });

    return rows;
  },

  /**
   * Specifically tracks high-value integrity events.
   * Triggers for Voids, Stock Adjusts, and Security breaches.
   */
  async getCriticalSecurityEvents(organizationId: string, limit = 20) {
    return await prisma.activityLog.findMany({
      where: {
        organizationId,
        critical: true,
      },
      include: {
        personnel: {
          select: {
            id: true,
            name: true,
            role: true,
            staffCode: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  /**
   * Trace all actions performed by a specific personnel member.
   * Vital for internal investigations.
   */
  async getPersonnelTrace(personnelId: string, limit = 50) {
    return await prisma.activityLog.findMany({
      where: { personnelId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        branch: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Fortress Integrity Check:
   * Verifies a log exists and provides the full metadata for audit verification.
   */
  async verifyActionIntegrity(activityId: string) {
    return await prisma.activityLog.findUnique({
      where: { id: activityId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        personnel: {
          select: {
            id: true,
            name: true,
            role: true,
            staffCode: true,
          },
        },
        branch: { select: { id: true, name: true } },
        approvalRequest: { select: { id: true, status: true } },
      },
    });
  },

  /**
   * Aggregate stats for the Audit Dashboard
   */
  async getAuditSummary(organizationId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalLogs, criticalLogs] = await Promise.all([
      prisma.activityLog.count({
        where: { organizationId, createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.activityLog.count({
        where: { organizationId, critical: true, createdAt: { gte: twentyFourHoursAgo } },
      }),
    ]);

    return {
      dailyActivityCount: totalLogs,
      dailyCriticalCount: criticalLogs,
      status: criticalLogs > 0 ? "REVIEW_REQUIRED" : "SECURE",
    };
  },

  /**
   * Lightweight helper: fetch distinct actions for filters (limited to top N)
   */
  async getDistinctActions(organizationId: string, limit = 100) {
    // Prisma doesn't support distinct with ordering across all providers consistently.
    // Use a raw query for Postgres, fallback to findMany + map if raw not available.
    try {
      const rows = await prisma.$queryRaw<
        { action: string }[]
      >`SELECT DISTINCT action FROM "ActivityLog" WHERE "organizationId" = ${organizationId} ORDER BY action LIMIT ${limit}`;
      return rows.map((r) => r.action);
    } catch {
      // Fallback: fetch recent logs and derive actions
      const recent = await prisma.activityLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { action: true },
      });
      return Array.from(new Set(recent.map((r) => r.action))).slice(0, limit);
    }
  },

  /**
   * Count logs matching a filter set (useful for pagination without fetching rows)
   */
  async countLogs(params: {
    organizationId: string;
    branchId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    action?: string | null;
    search?: string | null;
    personnelId?: string | null;
    isCritical?: boolean | null;
  }) {
    const { organizationId, branchId, startDate, endDate, action, search, personnelId, isCritical } =
      params;

    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(personnelId ? { personnelId } : {}),
      ...(isCritical !== undefined && isCritical !== null ? { critical: isCritical } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { ipAddress: { contains: search, mode: "insensitive" } },
              { deviceInfo: { contains: search, mode: "insensitive" } },
              { meta: { path: [], string_contains: search } as any },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    return prisma.activityLog.count({ where });
  },
};
