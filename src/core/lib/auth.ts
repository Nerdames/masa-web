/**
 * C:\Users\chibu\Projects\Next\masa\src\core\lib\auth.ts
 * * PRODUCTION-READY NEXTAUTH CONFIGURATION
 * Fortified for performance, strict typing, and cookie size optimization.
 * Integrated with Forensic Audit Engine V2.6 for cryptographic integrity.
 */

import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import prisma from "@/core/lib/prisma";
import { ROLE_PERMISSIONS_MATRIX } from "@/core/lib/permission";
import { getCachedPermissions, setCachedPermissions } from "@/core/lib/permissionCache";
import { createAuditLog } from "@/core/lib/audit";
import {
  Role,
  Severity,
  Resource,
  CriticalAction 
} from "@prisma/client";

// ============================================================================
// SHARED INTERFACES & TYPES
// ============================================================================
export interface AllowedBranch {
  id: string;
  name: string;
  role: Role;
}

// ============================================================================
// MODULE AUGMENTATION (STRICT TYPING)
// ============================================================================
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
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
      allowedBranches: AllowedBranch[];
      // Permissions are injected at the Session level, NOT the JWT level, to prevent cookie bloat
      permissions: string[];
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
    allowedBranches: AllowedBranch[];
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
    allowedBranches: AllowedBranch[];
    // Notice: `permissions` is intentionally omitted here to keep the cookie size under 4KB
  }
}

// ============================================================================
// CONSTANTS & CONFIG
// ============================================================================
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour idle disconnect
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000;  // 5 mins between DB heartbeat checks
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;   // 15 mins temporary lockout

// ============================================================================
// PERMISSION RESOLUTION HELPERS
// ============================================================================

/**
 * Loads organization-specific overrides from ResourcePermission table.
 */
async function loadOrgPermissionsFromDb(orgId: string, role: Role): Promise<string[]> {
  try {
    const rows = await prisma.resourcePermission.findMany({
      where: { organizationId: orgId, role },
      select: { resource: true, actions: true }
    });

    return rows.flatMap(row => 
      row.actions.map(action => `${action}:${row.resource}`.toUpperCase())
    );
  } catch (error) {
    console.error("[Auth:Permissions] Failed to load DB permissions", error);
    return [];
  }
}

/**
 * Merges Role Defaults with Database Overrides.
 * * CRITICAL PATH: Leverages O(1) Memory Cache to prevent UI rendering lag.
 */
async function resolvePermissionsUnion(orgId: string, role: Role): Promise<string[]> {
  // 1. FAST PATH: Memory Cache (0ms DB latency)
  const cached = getCachedPermissions(orgId, role);
  if (cached) return cached;

  // 2. SLOW PATH: Compute, DB Fetch, and Cache
  if (role === Role.DEV || role === Role.ADMIN) {
    const adminPerms = ["*:*"];
    setCachedPermissions(orgId, role, adminPerms);
    return adminPerms;
  }

  const defaultPerms = ROLE_PERMISSIONS_MATRIX[role] || [];
  const dbOverrides = await loadOrgPermissionsFromDb(orgId, role);

  const union = Array.from(new Set([
    ...defaultPerms.map(p => p.toUpperCase()),
    ...dbOverrides.map(p => p.toUpperCase())
  ]));

  setCachedPermissions(orgId, role, union);
  return union;
}

// ============================================================================
// NEXTAUTH CORE CONFIGURATION
// ============================================================================
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // 12 hours
  },

  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "MASA ERP Secure Access",
      credentials: {
        identifier: { label: "Email or Staff Code", type: "text" },
        password: { label: "Password", type: "password" },
        targetBranchId: { label: "Target Branch ID", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.identifier || !credentials?.password) return null;

        // Safe IP extraction behind reverse proxies
        const forwardedFor = req?.headers?.["x-forwarded-for"] as string | undefined;
        const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
        const deviceInfo = (req?.headers?.["user-agent"] as string) || "Unknown Device";
        const input = credentials.identifier.trim();
        const now = new Date();

        const personnel = await prisma.authorizedPersonnel.findFirst({
          where: {
            OR: [{ email: input.toLowerCase() }, { staffCode: input }],
            deletedAt: null,
          },
          include: {
            organization: true,
            branch: true, 
            branchAssignments: {
              where: { branch: { active: true, deletedAt: null } },
              include: { branch: true },
            },
          },
        });

        if (!personnel) throw new Error("INVALID_CREDENTIALS");
        if (personnel.organization && !personnel.organization.active) throw new Error("ORGANIZATION_SUSPENDED");

        // -----------------------------------------------------
        // Security & Brute Force Protection
        // -----------------------------------------------------
        const isTempLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;
        
        if (personnel.disabled || personnel.isLocked || isTempLocked) {
          const reason = personnel.disabled 
            ? "ACCOUNT_DISABLED" 
            : personnel.isLocked 
              ? personnel.lockReason || "ACCOUNT_LOCKED_ADMIN" 
              : "TEMPORARY_SECURITY_LOCKOUT";

          await prisma.$transaction(async (tx) => {
            await createAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              actorId: personnel.id,
              actorRole: personnel.role,
              action: "LOGIN_ATTEMPT_ON_BLOCKED_ACCOUNT",
              actionTrigger: CriticalAction.SUSPICIOUS_LOGIN, // Strictly linked to enum
              resource: Resource.PERSONNEL,
              resourceId: personnel.id,
              description: `Blocked login attempt: ${reason}`,
              severity: Severity.HIGH,
              critical: true,
              ipAddress,
              deviceInfo,
              metadata: { reason },
            });
          });
          throw new Error(reason);
        }

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
                lockoutUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null,
              },
            });

            // Enforce forensic tracking for password failures via enum bindings
            await createAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              actorId: personnel.id,
              actorRole: personnel.role,
              action: shouldLock ? "MAX_FAILED_ATTEMPTS_REACHED" : "INVALID_PASSWORD_ATTEMPT",
              actionTrigger: shouldLock ? CriticalAction.FAILED_LOGIN_LOCKOUT : CriticalAction.SUSPICIOUS_LOGIN,
              resource: Resource.PERSONNEL,
              resourceId: personnel.id,
              description: `Failed login attempt ${attempts}/${MAX_FAILED_ATTEMPTS}. ${shouldLock ? 'Account systematically locked.' : ''}`,
              severity: shouldLock ? Severity.CRITICAL : Severity.MEDIUM,
              critical: shouldLock,
              ipAddress,
              deviceInfo,
              metadata: { attemptCount: attempts }
            });
          });
          throw new Error(shouldLock ? "EXCESSIVE_FAILED_ATTEMPTS" : "INVALID_CREDENTIALS");
        }

        // -----------------------------------------------------
        // Branch & Role Resolution
        // -----------------------------------------------------
        let allowedBranches: AllowedBranch[] = [];
        let effectiveRole: Role = personnel.role;
        let activeBranchId: string | null = personnel.branchId;
        let activeBranchName: string | null = personnel.branch?.name ?? null;

        if (personnel.isOrgOwner) {
          const allBranches = await prisma.branch.findMany({
            where: { organizationId: personnel.organizationId, active: true, deletedAt: null },
            select: { id: true, name: true },
          });
          allowedBranches = allBranches.map((b) => ({ id: b.id, name: b.name, role: Role.ADMIN }));
          effectiveRole = Role.ADMIN;
        } else {
          allowedBranches = personnel.branchAssignments.map((ba) => ({
            id: ba.branchId,
            name: ba.branch.name,
            role: ba.role,
          }));
        }

        // Handle requested target branch or fallback to primary
        if (credentials.targetBranchId) {
          const target = allowedBranches.find((b) => b.id === credentials.targetBranchId);
          if (target) {
            activeBranchId = target.id;
            activeBranchName = target.name;
            effectiveRole = target.role;
          }
        } else if (!personnel.isOrgOwner && personnel.branchAssignments.length > 0) {
          const primary = personnel.branchAssignments.find((ba) => ba.isPrimary) || personnel.branchAssignments[0];
          activeBranchId = primary.branchId;
          activeBranchName = primary.branch.name;
          effectiveRole = primary.role;
        }

        // Apply successful login data
        await prisma.$transaction(async (tx) => {
          await tx.authorizedPersonnel.update({
            where: { id: personnel.id },
            data: { lastLogin: now, lastActivityAt: now, failedLoginAttempts: 0 },
          });

          await createAuditLog(tx, {
            organizationId: personnel.organizationId,
            branchId: activeBranchId,
            actorId: personnel.id,
            actorRole: effectiveRole,
            action: "LOGIN_SUCCESS",
            resource: Resource.PERSONNEL,
            resourceId: personnel.id,
            description: "User logged in successfully via credentials",
            severity: Severity.LOW,
            critical: false,
            ipAddress,
            deviceInfo,
          });
        });

        // Return lightweight user object (no massive permissions array here)
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
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }): Promise<JWT> {
      const now = Date.now();

      // 1. Initial Sign-in Map
      if (user) {
        return {
          ...token,
          id: user.id,
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
        };
      }

      // 2. Handle Dynamic Branch Switching
      if (trigger === "update" && session?.action === "SWITCH_BRANCH") {
        const targetId = session.targetBranchId;
        const target = token.allowedBranches.find(b => b.id === targetId);

        if (target || token.isOrgOwner) {
          const effectiveRole = target?.role || (token.isOrgOwner ? Role.ADMIN : token.role);
          
          return {
            ...token,
            branchId: targetId,
            branchName: target?.name || "Main",
            role: effectiveRole,
          };
        }
      }

      // 3. Security Heartbeat & DB Sync Throttling
      if (token.id && !token.expired) {
        const idle = now - (token.lastActivityAt || 0);
        
        // Force expiry if inactive
        if (idle > INACTIVITY_TIMEOUT_MS) {
          return { ...token, expired: true } as JWT;
        }

        // Throttle DB checks to prevent connection exhaustion
        if (idle > DB_UPDATE_THROTTLE_MS) {
          try {
            const dbState = await prisma.authorizedPersonnel.findUnique({
              where: { id: token.id },
              select: { disabled: true, isLocked: true, deletedAt: true },
            });

            if (!dbState || dbState.disabled || dbState.isLocked || dbState.deletedAt) {
              return { ...token, expired: true, disabled: true } as JWT;
            }

            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date(now) },
            });
            token.lastActivityAt = now;
          } catch (error) {
            console.error("[Auth:Heartbeat] DB Check Failed", error);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token?.id) {
        // DYNAMIC INJECTION: Resolve permissions here via O(1) Cache instead of bloating the JWT cookie
        const finalPermissions = await resolvePermissionsUnion(token.organizationId, token.role);

        session.user = {
          ...session.user,
          id: token.id,
          staffCode: token.staffCode,
          role: token.role,
          isOrgOwner: token.isOrgOwner,
          organizationId: token.organizationId,
          organizationName: token.organizationName,
          branchId: token.branchId,
          branchName: token.branchName,
          lastLogin: token.lastLogin,
          lastActivityAt: new Date(token.lastActivityAt).toISOString(),
          disabled: token.disabled,
          locked: token.locked,
          requiresPasswordChange: token.requiresPasswordChange,
          expired: token.expired || false,
          allowedBranches: token.allowedBranches,
          permissions: finalPermissions, // Injected for client use
        };
      }
      return session;
    },
  },

  pages: { 
    signIn: "/signin", 
    error: "/signin" 
  },
  secret: process.env.NEXTAUTH_SECRET,
};