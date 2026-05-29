/**
 * src/core/lib/auth.ts
 * * PRODUCTION-READY NEXTAUTH CONFIGURATION
 * Fortified for performance, strict typing, and cookie size optimization.
 * Integrated with Forensic Audit Engine V2.6 and B2B Google SSO.
 */

import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import prisma from "@/core/lib/prisma"; // Ensure this exports a singleton pattern instance
import { ROLE_PERMISSIONS_MATRIX } from "@/core/lib/permission";
import { getCachedPermissions, setCachedPermissions } from "@/core/lib/permissionCache";
import { createAuditLog } from "@/core/lib/audit";
import {
  Role,
  Severity,
  ActorType
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
      // Permissions injected at Session level (avoids 4KB cookie bloat)
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
 * Loads organization-specific overrides from the Permission table.
 */
async function loadOrgPermissionsFromDb(orgId: string, role: Role): Promise<string[]> {
  try {
    // Structural guard against hot-reload singleton drops
    if (typeof prisma === "undefined") {
      throw new Error("Prisma client is not initialized in the current context.");
    }

    const rows = await prisma.permission.findMany({
      where: { organizationId: orgId, role },
      select: { resource: true, action: true }
    });

    return rows.map(row => `${row.action}:${row.resource}`.toUpperCase());
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
  const cached = getCachedPermissions(orgId, role);
  if (cached) return cached;

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
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
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

        // FIXED: Robust proxy IP extraction mapping to ActivityLog bounds
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

        // --- Security & Brute Force Protection ---
        const isTempLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;
        
        if (personnel.disabled || personnel.isLocked || isTempLocked) {
          const reason = personnel.disabled 
            ? "ACCOUNT_DISABLED" 
            : personnel.isLocked 
              ? personnel.lockReason || "ACCOUNT_LOCKED_BY_ADMIN" 
              : "TEMPORARY_SECURITY_LOCKOUT";

          await prisma.$transaction(async (tx) => {
            await createAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              actorId: personnel.id,
              actorType: ActorType.USER,
              actorRole: personnel.role,
              action: "LOGIN_ATTEMPT_ON_BLOCKED_ACCOUNT",
              targetType: "PERSONNEL",
              targetId: personnel.id,
              description: `Blocked credentials login attempt: ${reason}`,
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

            await createAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              actorId: personnel.id,
              actorType: ActorType.USER,
              actorRole: personnel.role,
              action: shouldLock ? "MAX_FAILED_ATTEMPTS_REACHED" : "INVALID_PASSWORD_ATTEMPT",
              targetType: "PERSONNEL",
              targetId: personnel.id,
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

        // --- Branch & Role Resolution ---
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

        await prisma.$transaction(async (tx) => {
          await tx.authorizedPersonnel.update({
            where: { id: personnel.id },
            data: { lastLogin: now, lastActivityAt: now, failedLoginAttempts: 0 },
          });

          await createAuditLog(tx, {
            organizationId: personnel.organizationId,
            branchId: activeBranchId,
            actorId: personnel.id,
            actorType: ActorType.USER,
            actorRole: effectiveRole,
            action: "LOGIN_SUCCESS",
            targetType: "PERSONNEL",
            targetId: personnel.id,
            description: "User logged in successfully via credentials",
            severity: Severity.LOW,
            critical: false,
            ipAddress,
            deviceInfo,
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
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // STRICT B2B CONTROL: Prevent arbitrary Google signups. 
      // The email MUST already exist in the database, created by an admin.
      if (account?.provider === "google") {
        if (!user.email) return false;
        
        const personnel = await prisma.authorizedPersonnel.findFirst({
          where: { email: user.email.toLowerCase(), deletedAt: null },
          include: { organization: true },
        });

        if (!personnel) return "/signin?error=AccessDenied"; // Unregistered email
        if (personnel.organization && !personnel.organization.active) return "/signin?error=OrgSuspended";
        if (personnel.disabled || personnel.isLocked || (personnel.lockoutUntil && personnel.lockoutUntil > new Date())) {
            return "/signin?error=AccountLocked";
        }
        return true;
      }
      return true; // Credentials provider resolves via `authorize`
    },

    async jwt({ token, user, account, trigger, session }) {
      const now = Date.now();

      // 1. Initial Sign-in Map
      if (account && user) {
        // If SSO via Google, we must hydrate the token with real DB data 
        // since the `user` object only contains Google's basic profile payload.
        if (account.provider === "google" && user.email) {
            const personnel = await prisma.authorizedPersonnel.findFirst({
                where: { email: user.email.toLowerCase(), deletedAt: null },
                include: {
                  organization: true,
                  branch: true,
                  branchAssignments: {
                    where: { branch: { active: true, deletedAt: null } },
                    include: { branch: true },
                  },
                },
            });

            if (personnel) {
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

                if (!personnel.isOrgOwner && personnel.branchAssignments.length > 0) {
                    const primary = personnel.branchAssignments.find((ba) => ba.isPrimary) || personnel.branchAssignments[0];
                    activeBranchId = primary.branchId;
                    activeBranchName = primary.branch.name;
                    effectiveRole = primary.role;
                }

                // Update DB state asynchronously for Google Logins
                prisma.authorizedPersonnel.update({
                    where: { id: personnel.id },
                    data: { lastLogin: new Date(now), lastActivityAt: new Date(now), failedLoginAttempts: 0 },
                }).catch(console.error);

                return {
                    ...token,
                    id: personnel.id,
                    staffCode: personnel.staffCode,
                    role: effectiveRole,
                    isOrgOwner: personnel.isOrgOwner,
                    organizationId: personnel.organizationId,
                    organizationName: personnel.organization?.name ?? null,
                    branchId: activeBranchId,
                    branchName: activeBranchName,
                    lastLogin: new Date(now).toISOString(),
                    lastActivityAt: now,
                    disabled: personnel.disabled,
                    locked: personnel.isLocked,
                    requiresPasswordChange: personnel.requiresPasswordChange,
                    allowedBranches,
                };
            }
        } 
        
        // If Credentials, `user` is already populated correctly via `authorize` return
        if (account.provider === "credentials") {
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
      }

      // 2. FIXED: Universal Token Mutation Guard (Password Resets & Branch Switches)
      if (trigger === "update" && session) {
        // Handle Password Reset Mutator
        if (typeof session.requiresPasswordChange !== "undefined") {
          token.requiresPasswordChange = session.requiresPasswordChange;
        }

        // Handle Standard Field Mutators
        if (session.branchId) {
          token.branchId = session.branchId;
          token.branchName = session.branchName || token.branchName;
        }

        // Handle Explicit Branch Switch Mutator
        if (session.action === "SWITCH_BRANCH" && session.targetBranchId) {
          const target = token.allowedBranches.find(b => b.id === session.targetBranchId);
          if (target || token.isOrgOwner) {
            token.branchId = session.targetBranchId;
            token.branchName = target?.name || "Main";
            token.role = target?.role || (token.isOrgOwner ? Role.ADMIN : token.role);
          }
        }

        // Ensure token registers activity pulse on update
        token.lastActivityAt = now;
        return token;
      }

      // 3. Security Heartbeat & DB Sync Throttling
      if (token.id && !token.expired) {
        const idle = now - (token.lastActivityAt || 0);
        
        if (idle > INACTIVITY_TIMEOUT_MS) {
          return { ...token, expired: true } as JWT;
        }

        if (idle > DB_UPDATE_THROTTLE_MS) {
          try {
            const dbState = await prisma.authorizedPersonnel.findUnique({
              where: { id: token.id },
              select: { disabled: true, isLocked: true, requiresPasswordChange: true, deletedAt: true },
            });

            if (!dbState || dbState.disabled || dbState.isLocked || dbState.deletedAt) {
              return { ...token, expired: true, disabled: true } as JWT;
            }

            // Sync dynamic security requirements into the JWT memory
            token.requiresPasswordChange = dbState.requiresPasswordChange;

            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date(now) },
            });
          } catch (error) {
            console.error("[Auth:Heartbeat] DB Check Failed", error);
          }
        }

        // Slide the validation window forward on active requests
        token.lastActivityAt = now;
      }

      return token;
    },

    async session({ session, token }) {
      if (token?.id) {
        // FIXED: Clear cookie communication channel for expired sessions
        if (token.expired) {
          session.user = {
            ...session.user,
            expired: true,
          };
          return session;
        }

        // DYNAMIC INJECTION: Resolve permissions here via O(1) Cache to prevent cookie explosion
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
          permissions: finalPermissions,
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