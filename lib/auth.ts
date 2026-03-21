import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import prisma from "./prisma"; // Ensure this points to your Prisma client instance
import { Role } from "@prisma/client";

/* ------------------------------------------
 * Module Augmentation
 * ------------------------------------------ */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
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
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
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
  }
}

/* ------------------------------------------
 * Constants & Security Config
 * ------------------------------------------ */
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 Hour Auto-Logout
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000;  // 5 Minutes Heartbeat Sync
const MAX_FAILED_ATTEMPTS = 5;

/* ------------------------------------------
 * NextAuth Configuration
 * ------------------------------------------ */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 Hours Session Duration
  },

  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "MASA ERP Secure Access",
      credentials: {
        // We use "identifier" to allow either Email or Staff Code
        identifier: { label: "Email or Staff Code", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.identifier || !credentials?.password) return null;

        const ipAddress = (req?.headers?.["x-forwarded-for"] as string) || "127.0.0.1";
        const deviceInfo = (req?.headers?.["user-agent"] as string) || "Unknown Device";
        const input = credentials.identifier.trim();

        // 1. Dual-Path Lookup: Find user by Email OR Staff Code
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
              where: { isPrimary: true },
              include: { branch: true },
            },
          },
        });

        const now = new Date();

        // 2. Handle Unknown User (Generic error for security)
        if (!personnel) {
          console.warn(`[AUTH_WARN] Attempted login for non-existent identifier: ${input}`);
          return null;
        }

        // 3. Organization Shield (Kill-switch check)
        // If your Organization model doesn't have an 'active' field yet, 
        // you should add it to your schema for subscription management.
        if (personnel.organization && 'active' in personnel.organization && !personnel.organization.active) {
          throw new Error("ORGANIZATION_SUSPENDED");
        }

        // 4. Security Checks (Disabled / Locked / Temporary Lockout)
        const isTemporaryLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;

        if (personnel.disabled || personnel.isLocked || isTemporaryLocked) {
          const reason = personnel.disabled ? "ACCOUNT_DISABLED" : 
                         personnel.isLocked ? (personnel.lockReason || "ACCOUNT_LOCKED") : 
                         "TEMPORARY_LOCKOUT";

          await prisma.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              personnelId: personnel.id,
              action: "LOGIN_FAILED_SECURITY_BLOCK",
              critical: true,
              ipAddress,
              deviceInfo,
              metadata: { reason, attemptedIdentifier: input },
            },
          });
          throw new Error(reason);
        }

        // 5. Password Verification
        const isPasswordValid = await bcrypt.compare(credentials.password, personnel.password);

        if (!isPasswordValid) {
          const attempts = personnel.failedLoginAttempts + 1;
          const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
          
          await prisma.authorizedPersonnel.update({
            where: { id: personnel.id },
            data: {
              failedLoginAttempts: attempts,
              isLocked: shouldLock ? true : personnel.isLocked,
              lockReason: shouldLock ? "EXCESSIVE_FAILED_ATTEMPTS" : personnel.lockReason,
              lockoutUntil: shouldLock ? new Date(now.getTime() + 15 * 60 * 1000) : null, // 15 min cool-off
            },
          });

          await prisma.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              personnelId: personnel.id,
              action: "LOGIN_FAILED_PASSWORD",
              critical: shouldLock,
              ipAddress,
              deviceInfo,
              metadata: { attemptCount: attempts, locked: shouldLock },
            },
          });
          
          throw new Error("INVALID_CREDENTIALS");
        }

        // 6. Role & Branch Resolution (Hierarchical Logic)
        let effectiveRole: Role = personnel.role;
        let activeBranchId: string | null = personnel.branchId;
        let activeBranchName: string | null = personnel.branch?.name ?? null;

        // Owner/Admin Override
        if (personnel.isOrgOwner) {
          effectiveRole = Role.ADMIN;
        }

        // Primary Branch Assignment Logic
        if (personnel.branchAssignments.length > 0) {
          const primary = personnel.branchAssignments[0];
          effectiveRole = primary.role; 
          activeBranchId = primary.branchId;
          activeBranchName = primary.branch?.name ?? null;
        }

        // 7. Success Audit & Heartbeat Update
        await prisma.authorizedPersonnel.update({
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

        await prisma.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: activeBranchId,
            personnelId: personnel.id,
            action: "LOGIN_SUCCESS",
            ipAddress,
            deviceInfo,
            metadata: { loginType: input.includes("@") ? "email" : "staff_code" },
          },
        });

        return {
          id: personnel.id,
          name: personnel.name,
          email: personnel.email,
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
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }): Promise<JWT> {
      const now = Date.now();

      // Initial Sign In
      if (user) {
        return {
          ...token,
          id: user.id,
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
        };
      }

      // Handle profile/session updates (e.g. changing branches)
      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      // Heartbeat Logic & Inactivity Timeout
      if (token.id) {
        const lastActivity = (token.lastActivityAt as number) || 0;
        const idleTime = now - lastActivity;

        // Force logout if inactive for 1 hour
        if (idleTime > INACTIVITY_TIMEOUT_MS) {
          return { ...token, expired: true } as JWT;
        }

        // Throttle DB update to every 5 minutes to save performance
        if (idleTime > DB_UPDATE_THROTTLE_MS) {
          try {
            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date(now) },
            });
            token.lastActivityAt = now;
          } catch (e) {
            console.error("[AUTH_SYNC_ERROR] Heartbeat failed", e);
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && token.id) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.isOrgOwner = token.isOrgOwner;
        session.user.organizationId = token.organizationId;
        session.user.organizationName = token.organizationName;
        session.user.branchId = token.branchId;
        session.user.branchName = token.branchName;
        session.user.lastLogin = token.lastLogin;
        session.user.lastActivityAt = new Date(token.lastActivityAt).toISOString();
        session.user.disabled = token.disabled;
        session.user.locked = token.locked;
        session.user.requiresPasswordChange = token.requiresPasswordChange;
        session.user.expired = token.expired || false;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
  
  secret: process.env.NEXTAUTH_SECRET,
};