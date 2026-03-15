import { PrismaClient, Role, NotificationType, Prisma } from "@prisma/client";
import { pusherServer } from "./pusher";

// Helper to map Action strings to UI-friendly Notification content
function getNotificationConfig(action: string, meta: Record<string, unknown>) {
  const configs: Record<string, { type: NotificationType; title: string; message: string }> = {
    "SECURITY_BREACH_ATTEMPT": {
      type: "SECURITY",
      title: "High Priority Security Alert",
      message: `Suspicious login activity detected from IP: ${String(meta.ip || 'Unknown')}.`,
    },
    "LARGE_SALE_COMPLETED": {
      type: "SYSTEM",
      title: "Significant Revenue Event",
      message: `A sale of ₦${Number(meta.total || 0).toLocaleString()} was processed at ${String(meta.branchName || 'Branch')}.`,
    },
    "APPROVAL_REQUIRED": {
      type: "APPROVAL_REQUIRED",
      title: "Action Requires Approval",
      message: String(meta.message || "A staff member has requested an action that requires your approval."),
    }
  };

  return configs[action] || null;
}

const prismaClientSingleton = () => {
  return new PrismaClient().$extends({
    query: {
      activityLog: {
        async create({ args, query }) {
          const log = await query(args);

          if (log.critical) {
            const { organizationId, branchId, action, metadata, personnelId } = log;
            const meta = (metadata as Record<string, unknown>) || {};
            const config = getNotificationConfig(action, meta);

            if (config) {
              // 1. Save to Database for persistence
              const recipients = await Prisma.getExtensionContext(this).authorizedPersonnel.findMany({
                where: {
                  organizationId,
                  role: { in: [Role.ADMIN, Role.MANAGER] },
                  id: { not: personnelId ?? undefined },
                  deletedAt: null,
                },
                select: { id: true }
              });

              if (recipients.length > 0) {
                await Prisma.getExtensionContext(this).notification.create({
                  data: {
                    organizationId,
                    branchId,
                    type: config.type,
                    title: config.title,
                    message: config.message,
                    recipients: {
                      create: recipients.map((r) => ({
                        personnelId: r.id,
                      })),
                    },
                  },
                });
              }

              // 2. Broadcast via Pusher for real-time UI updates
              await pusherServer.trigger(`org-${organizationId}`, "critical-alert", {
                type: config.type,
                title: config.title,
                message: config.message,
                approvalId: meta.approvalId ? String(meta.approvalId) : undefined,
                code: meta.code ? String(meta.code) : undefined,
              });
            }
          }

          return log;
        },
      },
    },
  });
};

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;