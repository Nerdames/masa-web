import { z } from "zod";

export const SupportRequestSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
  category: z.string().default("GENERAL"),
  metadata: z.object({
    personnelId: z.string().cuid(),
    organizationId: z.string().cuid(),
    branchId: z.string().cuid().nullable(),
    isAdmin: z.boolean(),
    actionKey: z.string(), // Added to handle directed actions
  }),
});

export type SupportRequestInput = z.infer<typeof SupportRequestSchema>;