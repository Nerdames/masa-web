import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/core/lib/prisma"; // Adjust path to your Prisma client
import { 
  Role, 
  ActorType, 
  Severity, 
  NotificationType, 
  CriticalAction, 
  Prisma 
} from "@prisma/client";

/* ------------------------------------------
 * SHARED INTERFACES
 * ------------------------------------------ */
export interface AllowedBranch {
  id: string;
  name: string;
  role: Role;
}

/* ------------------------------------------
 * MODULE AUGMENTATION (STRICT TYPING)
 * ------------------------------------------ */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      staffCode: string | null;
      role: Role;
      isOrgOwner: boolean;
      organizationId: string;
      organizationName: string | null;
      branchId: string | null;
      branchName: string | null;
      lastLogin: string | null;
      lastActivityAt: string | null;
      disabled: boolean;
      locked: boolean;
      requiresPasswordChange: boolean;
      expired?: boolean;
      // PREMIUM ADDITIONS
      allowedBranches: AllowedBranch[];
      permissions: string[]; // Formatted as "ACTION:RESOURCE" (e.g., "CREATE:INVOICE")
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    staffCode: string | null;
    role: Role;
    isOrgOwner: boolean;
    organizationId: string;
    organizationName: string | null;
    branchId: string | null;
    branchName: string | null;
    lastLogin: string | null;
    lastActivityAt: string | null;
    disabled: boolean;
    locked: boolean;
    requiresPasswordChange: boolean;
    // PREMIUM ADDITIONS
    allowedBranches: AllowedBranch[];
    permissions: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    staffCode: string | null;
    role: Role;
    isOrgOwner: boolean;
    organizationId: string;
    organizationName: string | null;
    branchId: string | null;
    branchName: string | null;
    lastLogin: string | null;
    lastActivityAt: number;
    disabled: boolean;
    locked: boolean;
    requiresPasswordChange: boolean;
    expired?: boolean;
    // PREMIUM ADDITIONS
    allowedBranches: AllowedBranch[];
    permissions: string[];
  }
}

/* ------------------------------------------
 * CONFIGURATION & SECURITY CONSTANTS
 * ------------------------------------------ */
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 Hour Auto-Logout (POS Security Standard)
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000;  // 5 Minutes Heartbeat Sync
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;   // 15 Minutes

/* ------------------------------------------
 * FORENSIC LOGGING HELPER (CRYPTOGRAPHIC)
 * ------------------------------------------ */
async function secureAuditLog(tx: Prisma.TransactionClient, data: {
  organizationId: string;
  branchId?: string | null;
  actorId: string;
  actorRole?: Role;
  action: string;
  severity: Severity;
  critical: boolean;
  ipAddress: string;
  deviceInfo: string;
  metadata?: any;
}) {
  const lastLog = await tx.activityLog.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });

  const previousHash = lastLog?.hash ?? null;
  const requestId = crypto.randomUUID();

  // Create cryptographic chain link
  const hashPayload = { ...data, previousHash, requestId, timestamp: Date.now() };
  const hash = crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex");

  return await tx.activityLog.create({
    data: {
      ...data,
      actorType: ActorType.USER,
      requestId,
      previousHash,
      hash,
      metadata: data.metadata ?? Prisma.JsonNull,
    },
  });
}

/* ------------------------------------------
 * NEXTAUTH CORE CONFIGURATION
 * ------------------------------------------ */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // 12 Hours Maximum Shift Duration
  },

  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "MASA ERP Secure Access",
      credentials: {
        identifier: { label: "Email or Staff Code", type: "text" },
        password: { label: "Password", type: "password" },
        targetBranchId: { label: "Target Branch ID (Optional)", type: "text" }
      },
      async authorize(credentials, req) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const ipAddress = (req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
                          (req?.headers?.["x-real-ip"] as string) || 
                          "127.0.0.1";
        const deviceInfo = (req?.headers?.["user-agent"] as string) || "Unknown Device";
        const input = credentials.identifier.trim();
        const now = new Date();

        // 1. Comprehensive Lookup (Including ALL assigned branches)
        const personnel = await prisma.authorizedPersonnel.findFirst({
          where: {
            OR: [
              { email: input.toLowerCase() },
              { staffCode: input }
            ],
            deletedAt: null,
          },
          include: {
            organization: true,
            branch: true,
            branchAssignments: {
              include: { branch: true },
            },
          },
        });

        if (!personnel) {
          console.warn(`[AUTH_WARN] Unrecognized identity attempt: ${input} from IP: ${ipAddress}`);
          return null;
        }

        if (personnel.organization && 'active' in personnel.organization && !personnel.organization.active) {
          throw new Error("ORGANIZATION_SUSPENDED");
        }

        // 2. Account Block Verification
        const isTemporaryLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;

        if (personnel.disabled || personnel.isLocked || isTemporaryLocked) {
          const reason = personnel.disabled ? "ACCOUNT_DISABLED" : 
                         personnel.isLocked ? (personnel.lockReason || "ACCOUNT_LOCKED_ADMIN") : 
                         "TEMPORARY_SECURITY_LOCKOUT";

          await prisma.$transaction(async (tx) => {
            await secureAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              actorId: personnel.id,
              actorRole: personnel.role,
              action: "LOGIN_FAILED_SECURITY_BLOCK",
              severity: Severity.HIGH,
              critical: true,
              ipAddress,
              deviceInfo,
              metadata: { reason, attemptedIdentifier: input },
            });
          });
          throw new Error(reason);
        }

        // 3. Cryptographic Password Verification
        const isPasswordValid = await bcrypt.compare(credentials.password, personnel.password);

        if (!isPasswordValid) {
          const attempts = personnel.failedLoginAttempts + 1;
          const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

          await prisma.$transaction(async (tx) => {
            await tx.authorizedPersonnel.update({
              where: { id: personnel.id },
              data: {
                failedLoginAttempts: attempts,
                isLocked: shouldLock ? true : personnel.isLocked,
                lockReason: shouldLock ? "EXCESSIVE_FAILED_ATTEMPTS" : personnel.lockReason,
                lockoutUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null,
              },
            });

            const auditLog = await secureAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              actorId: personnel.id,
              actorRole: personnel.role,
              action: "LOGIN_FAILED_PASSWORD",
              severity: shouldLock ? Severity.CRITICAL : Severity.MEDIUM,
              critical: shouldLock,
              ipAddress,
              deviceInfo,
              metadata: { attemptCount: attempts, locked: shouldLock },
            });

            if (shouldLock) {
              const alertingPersonnel = await tx.authorizedPersonnel.findMany({
                where: {
                  organizationId: personnel.organizationId,
                  deletedAt: null,
                  disabled: false,
                  OR: [
                    { role: Role.ADMIN },
                    { isOrgOwner: true }
                  ]
                },
                select: { id: true }
              });

              if (alertingPersonnel.length > 0) {
                await tx.notification.create({
                  data: {
                    organizationId: personnel.organizationId,
                    type: NotificationType.SECURITY,
                    actionTrigger: CriticalAction.USER_LOCK_UNLOCK,
                    activityLogId: auditLog.id,
                    title: "Security Lockout Triggered",
                    message: `Personnel ${personnel.name || personnel.email} has been automatically locked out due to excessive failed attempts.`,
                    recipients: {
                      create: alertingPersonnel.map(admin => ({ personnelId: admin.id }))
                    }
                  }
                });
              }
            }
          });
          throw new Error(shouldLock ? "EXCESSIVE_FAILED_ATTEMPTS" : "INVALID_CREDENTIALS");
        }

        // 4. Branch & Role Resolution Matrix (The "Switch Branch" Foundation)
        let allowedBranches: AllowedBranch[] = [];
        let effectiveRole: Role = personnel.role;
        let activeBranchId: string | null = personnel.branchId;
        let activeBranchName: string | null = personnel.branch?.name ?? null;

        if (personnel.isOrgOwner) {
          // Admin/Owner sees ALL active branches at login
          const allOrgBranches = await prisma.branch.findMany({
            where: { organizationId: personnel.organizationId, active: true, deletedAt: null },
            select: { id: true, name: true }
          });
          allowedBranches = allOrgBranches.map(b => ({ id: b.id, name: b.name, role: Role.ADMIN }));
          effectiveRole = Role.ADMIN;
        } else {
          // Standard Personnel constrained to assigned branches
          allowedBranches = personnel.branchAssignments
            .filter(ba => ba.branch.active && !ba.branch.deletedAt)
            .map(ba => ({
              id: ba.branchId,
              name: ba.branch.name,
              role: ba.role
            }));
        }

        // Handle Target Branch Mapping (If provided via UI login screen or defaulting)
        if (credentials.targetBranchId) {
          const target = allowedBranches.find(b => b.id === credentials.targetBranchId);
          if (target) {
            activeBranchId = target.id;
            activeBranchName = target.name;
            effectiveRole = target.role;
          }
        } else if (!personnel.isOrgOwner && personnel.branchAssignments.length > 0) {
          // Default to Primary Branch
          const primary = personnel.branchAssignments.find(ba => ba.isPrimary) || personnel.branchAssignments[0];
          activeBranchId = primary.branchId;
          activeBranchName = primary.branch.name;
          effectiveRole = primary.role;
        }

        // 5. Fetch Granular Permissions based on Effective Role
        const rawPermissions = await prisma.permission.findMany({
          where: { organizationId: personnel.organizationId, role: effectiveRole },
          select: { action: true, resource: true }
        });
        const permissionsMap = rawPermissions.map(p => `${p.action}:${p.resource}`);

        // 6. Success: Atomic State Reset & Audit
        await prisma.$transaction(async (tx) => {
          await tx.authorizedPersonnel.update({
            where: { id: personnel.id },
            data: {
              lastLogin: now,
              lastActivityAt: now,
              failedLoginAttempts: 0,
              lockoutUntil: null,
              lastLoginIp: ipAddress,
              lastLoginDevice: deviceInfo,
            },
          });

          await secureAuditLog(tx, {
            organizationId: personnel.organizationId,
            branchId: activeBranchId,
            actorId: personnel.id,
            actorRole: effectiveRole,
            action: "LOGIN_SUCCESS",
            severity: Severity.LOW,
            critical: false,
            ipAddress,
            deviceInfo,
            metadata: { loginType: input.includes("@") ? "email" : "staff_code", activeBranchId },
          });
        });

        return {
          id: personnel.id,
          name: personnel.name,
          email: personnel.email,
          staffCode: personnel.staffCode,
          role: effectiveRole,
          isOrgOwner: personnel.isOrgOwner,
          organizationId: personnel.organizationId,
          organizationName: personnel.organization?.name ?? null,
          branchId: activeBranchId,
          branchName: activeBranchName,
          lastLogin: now.toISOString(),
          lastActivityAt: now.toISOString(),
          disabled: personnel.disabled,
          locked: personnel.isLocked,
          requiresPasswordChange: personnel.requiresPasswordChange,
          allowedBranches,
          permissions: permissionsMap,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session, req }): Promise<JWT> {
      const now = Date.now();

      // Sign In Payload Initialization
      if (user) {
        return {
          ...token,
          id: user.id,
          name: user.name,
          email: user.email,
          staffCode: user.staffCode,
          role: user.role,
          isOrgOwner: user.isOrgOwner,
          organizationId: user.organizationId,
          organizationName: user.organizationName,
          branchId: user.branchId,
          branchName: user.branchName,
          lastLogin: user.lastLogin,
          lastActivityAt: now,
          disabled: user.disabled,
          locked: user.locked,
          requiresPasswordChange: user.requiresPasswordChange,
          allowedBranches: user.allowedBranches,
          permissions: user.permissions,
        };
      }

      // MID-SESSION UPDATES & BRANCH SWITCHING
      if (trigger === "update" && session) {
        
        // --- 1. THE BRANCH SWITCH LOGIC (NOW DYNAMIC & DB-VERIFIED) ---
        if (session.action === "SWITCH_BRANCH" && session.targetBranchId) {
          const targetBranchId = session.targetBranchId;
          
          let validBranchRole: Role | null = null;
          let validBranchName: string | null = null;
          let updatedAllowedBranches: AllowedBranch[] = [];

          if (token.isOrgOwner) {
            // FUTURE PROOF: Query DB dynamically so OrgOwners can switch to branches 
            // created *during* their active session without needing to log out.
            const branch = await prisma.branch.findFirst({
              where: { 
                id: targetBranchId, 
                organizationId: token.organizationId, 
                active: true, 
                deletedAt: null 
              }
            });
            
            if (branch) {
              validBranchRole = Role.ADMIN;
              validBranchName = branch.name;
              
              // Refresh the entire allowed branches list to catch any new additions
              const allOrgBranches = await prisma.branch.findMany({
                where: { organizationId: token.organizationId, active: true, deletedAt: null },
                select: { id: true, name: true }
              });
              updatedAllowedBranches = allOrgBranches.map(b => ({ id: b.id, name: b.name, role: Role.ADMIN }));
            }
          } else {
            // Strictly enforce standard personnel against current DB assignments
            const assignment = await prisma.branchAssignment.findFirst({
              where: { personnelId: token.id, branchId: targetBranchId },
              include: { branch: true }
            });

            if (assignment && assignment.branch.active && !assignment.branch.deletedAt) {
              validBranchRole = assignment.role;
              validBranchName = assignment.branch.name;

              // Refresh assignments list
              const activeAssignments = await prisma.branchAssignment.findMany({
                where: { personnelId: token.id, branch: { active: true, deletedAt: null } },
                include: { branch: { select: { id: true, name: true } } }
              });
              updatedAllowedBranches = activeAssignments.map(a => ({ id: a.branch.id, name: a.branch.name, role: a.role }));
            }
          }

          if (!validBranchRole || !validBranchName) {
            console.warn(`[SECURITY] Invalid branch switch attempt by ${token.id} to ${targetBranchId}`);
            return token; // Reject silent escalation
          }

          // Fetch new granular permissions for the new role
          const newPermissionsData = await prisma.permission.findMany({
            where: { organizationId: token.organizationId, role: validBranchRole },
            select: { action: true, resource: true }
          });
          
          const newPermissions = newPermissionsData.map(p => `${p.action}:${p.resource}`);

          // Log the forensic trace of the context shift
          await prisma.$transaction(async (tx) => {
            await secureAuditLog(tx, {
              organizationId: token.organizationId,
              branchId: targetBranchId,
              actorId: token.id,
              actorRole: validBranchRole as Role,
              action: "SESSION_BRANCH_SWITCH",
              severity: Severity.LOW,
              critical: false,
              ipAddress: "INTERNAL_REQ",
              deviceInfo: "INTERNAL_REQ",
              metadata: { fromBranch: token.branchId, toBranch: targetBranchId },
            });
          });

          return { 
            ...token, 
            branchId: targetBranchId,
            branchName: validBranchName,
            role: validBranchRole,
            permissions: newPermissions,
            allowedBranches: updatedAllowedBranches // Ensures UI dropdowns stay sync'd mid-session
          };
        }

        // --- 2. STANDARD PROFILE UPDATES ---
        return { 
          ...token, 
          name: session.name ?? token.name,
          requiresPasswordChange: session.requiresPasswordChange ?? token.requiresPasswordChange 
        };
      }

      // Dynamic Heartbeat & Mid-Session Security Revocation
      if (token.id && !token.expired) {
        const lastActivity = (token.lastActivityAt as number) || 0;
        const idleTime = now - lastActivity;

        if (idleTime > INACTIVITY_TIMEOUT_MS) {
          return { ...token, expired: true } as JWT;
        }

        // Throttle DB calls to preserve connection pool under heavy POS load
        if (idleTime > DB_UPDATE_THROTTLE_MS) {
          try {
            const personnelState = await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date(now) },
              select: { 
                disabled: true, 
                isLocked: true, 
                deletedAt: true, 
                branchAssignments: { select: { branchId: true } } 
              }
            });

            // INSTANT KILL-SWITCH: If admin disabled the user mid-session
            if (!personnelState || personnelState.disabled || personnelState.isLocked || personnelState.deletedAt) {
              return { ...token, expired: true, disabled: true, locked: true } as JWT;
            }

            // MID-SESSION REVOCATION CHECK: Did an admin remove their access to the current active branch?
            // OrgOwners are exempt as they inherently have access to all active branches.
            if (!token.isOrgOwner) {
               const stillHasAccess = personnelState.branchAssignments.some(ba => ba.branchId === token.branchId);
               if (!stillHasAccess) {
                 return { ...token, expired: true, disabled: true } as JWT; // Force logout if current branch revoked
               }
            }

            token.lastActivityAt = now;
          } catch (e) {
            console.error("[AUTH_HEARTBEAT_ERROR]", e);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.staffCode = token.staffCode;
        session.user.role = token.role;
        session.user.isOrgOwner = token.isOrgOwner;
        session.user.organizationId = token.organizationId;
        session.user.organizationName = token.organizationName;
        session.user.branchId = token.branchId;
        session.user.branchName = token.branchName;
        session.user.lastLogin = token.lastLogin;
        session.user.lastActivityAt = new Date(token.lastActivityAt as number).toISOString();
        session.user.disabled = token.disabled;
        session.user.locked = token.locked;
        session.user.requiresPasswordChange = token.requiresPasswordChange;
        session.user.expired = token.expired || false;
        
        // PREMIUM INJECTIONS
        session.user.allowedBranches = token.allowedBranches || [];
        session.user.permissions = token.permissions || [];
      }
      return session;
    },
  },

  events: {
    // Precise Audit Trail for Sign Outs
    async signOut({ token }) {
      if (token?.id) {
        try {
          await prisma.authorizedPersonnel.update({
            where: { id: token.id },
            data: { lastActivityAt: new Date() },
          });
        } catch (e) {
          console.error("[AUTH_SIGNOUT_ERROR] Failed to mark final activity", e);
        }
      }
    },
  },

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  secret: process.env.NEXTAUTH_SECRET,
};