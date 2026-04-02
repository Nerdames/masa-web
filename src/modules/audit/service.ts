// src/modules/audit/service.ts
import prisma from "@/core/lib/prisma";
import { CriticalAction } from "@prisma/client";

interface LogOptions {
  personnelId: string;
  action: string | CriticalAction;
  details?: string;
  meta?: Record<string, any> | string;
  branchId?: string | null;
  organizationId?: string;
  approvalRequestId?: string | null;
}

/**
 * Recursively remove sensitive keys from an object.
 */
function sanitizeMetadata(input: any): any {
  if (input === null || input === undefined) return input;

  const SENSITIVE_KEYS = new Set([
    "password",
    "pass",
    "pwd",
    "token",
    "accessToken",
    "refreshToken",
    "secret",
    "ssn",
    "creditCard",
    "cardNumber",
    "cvv",
    "pin",
  ]);

  if (Array.isArray(input)) {
    return input.map((v) => sanitizeMetadata(v));
  }

  if (typeof input === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = sanitizeMetadata(v);
    }
    return out;
  }

  return input;
}

/**
 * Truncate large metadata payloads to avoid huge DB writes and exports.
 * Returns either the original object or a truncated summary object.
 */
function truncateMetadata(obj: any, maxChars = 10_000) {
  try {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (str.length <= maxChars) {
      return typeof obj === "string" ? JSON.parseSafe?.(str) ?? obj : obj;
    }

    // If too large, keep a small summary and the top-level keys
    const summary: Record<string, any> = {
      _truncated: true,
      _originalLength: str.length,
      _keptKeys: [],
    };

    if (typeof obj === "object" && obj !== null) {
      const keys = Object.keys(obj).slice(0, 20);
      for (const k of keys) {
        const v = obj[k];
        try {
          summary._keptKeys.push({ [k]: typeof v === "object" ? "[OBJECT]" : String(v) });
        } catch {
          summary._keptKeys.push({ [k]: "[UNSERIALIZABLE]" });
        }
      }
    } else {
      summary._value = String(obj).slice(0, 500);
    }

    return summary;
  } catch {
    return { _truncated: true };
  }
}

/**
 * Fortress Audit Logger
 * Standardized utility to record system and user actions.
 * Integrates with the Prisma Extension to trigger real-time alerts on critical actions.
 *
 * Important constraints:
 * - Append-only: this function only creates new activityLog records.
 * - Sensitive fields are redacted before persisting.
 * - Fail-safe: never throws; errors are logged and swallowed.
 */
export async function logActivity({
  personnelId,
  action,
  details,
  meta,
  branchId,
  organizationId,
  approvalRequestId,
}: LogOptions) {
  try {
    let targetOrgId = organizationId;
    let targetBranchId = branchId;

    // 1. Auto-resolve Organization/Branch context if missing
    if (!targetOrgId) {
      const user = await prisma.authorizedPersonnel.findUnique({
        where: { id: personnelId },
        select: { organizationId: true, branchId: true },
      });

      if (user) {
        targetOrgId = user.organizationId;
        // Only override branchId if it wasn't explicitly passed as undefined
        if (targetBranchId === undefined) {
          targetBranchId = user.branchId;
        }
      }
    }

    if (!targetOrgId) {
      // If we cannot determine organization context, skip logging to avoid orphaned records.
      // This is intentional: logs must be associated with an organization.
      console.warn(
        `[AUDIT_LOG_SKIPPED]: No organization context found for personnel ${personnelId}`
      );
      return null;
    }

    // 2. Determine if this is a "Critical" action based on the Schema Enum
    const isCritical =
      typeof action === "string" &&
      Object.values(CriticalAction).includes(action as CriticalAction);

    // 3. Prepare metadata safely
    let metaObj: any = null;
    if (meta !== undefined && meta !== null) {
      try {
        metaObj = typeof meta === "string" ? JSON.parse(meta) : meta;
      } catch {
        // If parsing fails, keep as string but mark it
        metaObj = { _raw: String(meta) };
      }

      // Sanitize sensitive fields recursively
      metaObj = sanitizeMetadata(metaObj);

      // Truncate if too large
      metaObj = truncateMetadata(metaObj);
    }

    // 4. Create the log entry (append-only)
    // NOTE: This will trigger any Prisma middleware/extensions you have configured
    // (for example: emitting 'security.alert' when critical === true).
    const created = await prisma.activityLog.create({
      data: {
        organizationId: targetOrgId,
        branchId: targetBranchId ?? null,
        personnelId,
        action: String(action),
        details: details ?? null,
        critical: Boolean(isCritical),
        approvalRequestId: approvalRequestId ?? null,
        meta: metaObj ?? null,
      },
    });

    return created;
  } catch (error) {
    /**
     * "FAIL-SAFE" PROTOCOL:
     * We log the error to the console but do not throw.
     * In a production ERP, a failure in the audit trail should not
     * crash the primary transaction (e.g., making a sale).
     */
    try {
      console.error("[FORTRESS_AUDIT_FAILURE]:", error);
    } catch {
      // swallow any logging errors
    }
    return null;
  }
}
