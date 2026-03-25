import prisma from "@/core/lib/prisma";
import { Prisma, Role } from "@prisma/client";

export const AuditRepository = {
  /**
   * Fetches the master activity log with heavy filtering for Auditor/Admin roles.
   * Optimized for the Fortress Management interface.
   */
  async getGlobalLogs(params: {
    organizationId: string;
    branchId?: string | null;
    role?: Role;
    limit?: number;
    offset?: number;
    isCritical?: boolean;
    startDate?: Date;
    endDate?: Date;
    action?: string;
  }) {
    const { 
      organizationId, 
      branchId, 
      limit = 50, 
      offset = 0, 
      isCritical,
      startDate,
      endDate,
      action 
    } = params;

    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
      ...(branchId && { branchId }),
      ...(isCritical !== undefined && { critical: isCritical }),
      ...(action && { action: { contains: action, mode: 'insensitive' } }),
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        }
      } : {}),
    };

    // Execute query and count in parallel for pagination support in DataTables
    const [data, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          personnel: {
            select: {
              name: true,
              email: true,
              role: true,
              staffCode: true,
            },
          },
          approvalRequest: {
            select: {
              status: true,
              title: true,
              approver: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where })
    ]);

    return { data, total };
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
            name: true, 
            role: true,
            staffCode: true 
          } 
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
        branch: { select: { name: true } }
      }
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
            name: true,
            registrationNumber: true 
          } 
        },
        personnel: {
          select: {
            name: true,
            role: true
          }
        }
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
        where: { organizationId, createdAt: { gte: twentyFourHoursAgo } }
      }),
      prisma.activityLog.count({
        where: { organizationId, critical: true, createdAt: { gte: twentyFourHoursAgo } }
      })
    ]);

    return {
      dailyActivityCount: totalLogs,
      dailyCriticalCount: criticalLogs,
      status: criticalLogs > 0 ? "REVIEW_REQUIRED" : "SECURE"
    };
  }
};