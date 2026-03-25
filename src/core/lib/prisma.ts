// src/core/lib/prisma.ts
import { PrismaClient, CriticalAction, NotificationType } from "@prisma/client";
import { eventBus } from "../events/bus";

const prismaClientSingleton = () => {
  return new PrismaClient().$extends({
    query: {
      activityLog: {
        async create({ args, query }) {
          // 1. Execute the DB operation first
          const log = await query(args);

          /**
           * INTEGRATION: Fortress Security Hook
           * We wrap this in a non-awaiting block or a try-catch to ensure
           * that notification failures never break the primary database write.
           */
          if (log.critical) {
            // Fire and forget to keep the DB connection snappy
            (async () => {
              try {
                eventBus.emitEvent("security.alert", {
                  organizationId: log.organizationId,
                  branchId: log.branchId ?? undefined,
                  activityLogId: log.id,
                  actionTrigger: log.action as CriticalAction,
                  notificationType: NotificationType.SECURITY,
                  title: "Critical Audit Event",
                  message: `Critical action [${log.action}] detected in system logs.`,
                });
              } catch (error) {
                console.error("[FORTRESS_EXT_ERROR]: Event bus emission failed", error);
              }
            })();
          }

          return log;
        },
      },
    },
  });
};

// Properly type the extended client for global usage
type PrismaClientWithExtensions = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithExtensions | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;