import { getServerSession } from "next-auth";
import { authOptions } from "@/core/lib/auth";
import { authorize } from "@/core/lib/permission";
import { PermissionAction, Severity, CriticalAction } from "@prisma/client";
import { createAuditLog } from "@/core/lib/audit";
import { NextResponse } from "next/server";

/**
 * ResourceType supports custom resource identifiers.
 */
export type ResourceType = string;

interface ValidateRequestParams {
  action?: PermissionAction;
  resource?: ResourceType;
  criticalAction?: CriticalAction;
  pathname?: string;
}

/**
 * PRODUCTION-READY REQUEST VALIDATOR
 * * 1. Validates the Session.
 * 2. Executes the RBAC/Permission engine.
 * 3. Automatically logs security violations to the ActivityLog[cite: 5].
 */
export async function validateRequest(params: ValidateRequestParams) {
  // Fetch session with augmented user types 
  const session = await getServerSession(authOptions);

  // 1. Authentication Check
  if (!session?.user) {
    return { 
      authorized: false, 
      response: new NextResponse(
        JSON.stringify({ error: "Unauthenticated", message: "Session expired or missing." }), 
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
      user: null 
    };
  }

  // 2. Authorization Engine Call
  // Uses session.user.permissions and session.user.role [cite: 2005-2006]
  const { allowed, reason, requiresApproval } = authorize({
    role: session.user.role,
    isOrgOwner: session.user.isOrgOwner,
    userPermissions: session.user.permissions, 
    ...params
  });

  // 3. Forbidden Logic & Automatic Auditing
  if (!allowed) {
    // Audit the security violation using the high-integrity log system [cite: 5]
    await createAuditLog({
      action: "SECURITY_VIOLATION",
      entityType: (params.resource as string) || "SYSTEM",
      entityId: "NA",
      organizationId: session.user.organizationId,
      actorId: session.user.id,
      severity: Severity.HIGH, // [cite: 187]
      description: `Access Denied: ${reason || "User lacks required permission"}`,
      changes: { 
        attemptedParams: params,
        userRole: session.user.role,
        isOrgOwner: session.user.isOrgOwner 
      }
    });

    return { 
      authorized: false, 
      response: new NextResponse(
        JSON.stringify({ 
          error: "Forbidden", 
          message: reason || "Access denied.",
          requiresApproval 
        }), 
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
      requiresApproval
    };
  }

  // 4. Success State
  return { 
    authorized: true, 
    user: session.user,
    response: null 
  };
}