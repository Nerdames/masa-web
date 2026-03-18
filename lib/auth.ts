import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import prisma from "./prisma"; // Adjust path to your Prisma client
import { Role } from "@prisma/client";

/* ------------------------------------------
 * Module augmentation for NextAuth
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
 * Constants
 * ------------------------------------------ */
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;

/* ------------------------------------------
 * NextAuth Configuration
 * ------------------------------------------ */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const ipAddress = (req?.headers?.["x-forwarded-for"] as string) || "Unknown IP";
        const deviceInfo = (req?.headers?.["user-agent"] as string) || "Unknown Device";

        const personnel = await prisma.authorizedPersonnel.findFirst({
          where: {
            email: credentials.email.trim().toLowerCase(),
            deletedAt: null,
          },
          include: {
            organization: true,
            branch: true,
            branchAssignments: {
              where: { isPrimary: true }, // Optimization: Only fetch the primary branch
              include: {
                branch: true,
              },
            },
          },
        });

        const now = new Date();

        // 1. Handle Unknown User
        if (!personnel) {
          console.warn(`[AUTH] Failed login attempt for unknown email: ${credentials.email}`);
          return null;
        }

        // 2. Check Security Status (Disabled or Locked)
        const isTemporaryLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;

        if (personnel.disabled || personnel.isLocked || isTemporaryLocked) {
          const lockReason = personnel.disabled
            ? "disabled"
            : personnel.isLocked
            ? personnel.lockReason ?? "locked"
            : "temporary_lockout";

          await prisma.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              personnelId: personnel.id,
              action: "LOGIN_FAILED_LOCKED",
              critical: true,
              ipAddress,
              deviceInfo,
              metadata: { reason: lockReason },
              createdAt: now,
            },
          });

          throw new Error(lockReason);
        }

        // 3. Password Verification
        const isValid = await bcrypt.compare(credentials.password, personnel.password);

        if (!isValid) {
          const attempts = personnel.failedLoginAttempts + 1;
          const isNowLocked = attempts >= MAX_FAILED_ATTEMPTS;
          const lockout = isNowLocked ? new Date(now.getTime() + 15 * 60 * 1000) : null;

          await Promise.all([
            prisma.authorizedPersonnel.update({
              where: { id: personnel.id },
              data: {
                failedLoginAttempts: attempts,
                lockoutUntil: lockout,
                isLocked: isNowLocked ? true : personnel.isLocked,
                lockReason: isNowLocked ? "EXCESSIVE_FAILED_ATTEMPTS" : personnel.lockReason
              },
            }),
            prisma.activityLog.create({
              data: {
                organizationId: personnel.organizationId,
                branchId: personnel.branchId,
                personnelId: personnel.id,
                action: "LOGIN_FAILED",
                critical: isNowLocked,
                ipAddress,
                deviceInfo,
                metadata: { failedAttempts: attempts },
                createdAt: now,
              },
            }),
          ]);

          throw new Error("CredentialsSignin");
        }

        // 4. Resolve Effective Role and Active Branch
        let effectiveRole: Role = personnel.role;
        let activeBranchId: string | null = personnel.branchId;
        let activeBranchName: string | null = personnel.branch?.name ?? null;

        if (personnel.isOrgOwner) {
          effectiveRole = Role.ADMIN;
        } else if (personnel.branchAssignments.length > 0) {
          const primaryAssignment = personnel.branchAssignments[0];
          effectiveRole = primaryAssignment.role;
          activeBranchId = primaryAssignment.branchId;
          activeBranchName = primaryAssignment.branch?.name ?? null;
        }

        // 5. Success Updates
        await Promise.all([
          prisma.authorizedPersonnel.update({
            where: { id: personnel.id },
            data: {
              lastLogin: now,
              lastActivityAt: now,
              failedLoginAttempts: 0,
              lockoutUntil: null,
              lastLoginIp: ipAddress,
              lastLoginDevice: deviceInfo,
            },
          }),
          prisma.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: activeBranchId,
              personnelId: personnel.id,
              action: "LOGIN_SUCCESS",
              ipAddress,
              deviceInfo,
              metadata: { role: effectiveRole, assignedBranchId: activeBranchId },
              createdAt: now,
            },
          }),
        ]);

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

  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },

  callbacks: {
    async jwt({ token, user, trigger, session }): Promise<JWT> {
      const now = Date.now();

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

      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      if (token.id) {
        const lastActivity = (token.lastActivityAt as number) || 0;
        const idleTime = now - lastActivity;

        if (idleTime > INACTIVITY_TIMEOUT_MS) {
          return { ...token, expired: true } as JWT;
        }

        if (idleTime > DB_UPDATE_THROTTLE_MS) {
          try {
            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date(now) },
            });
            token.lastActivityAt = now;
          } catch (error) {
            console.error("Auth: Failed to sync activity heartbeat", error);
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
        session.user.lastActivityAt = token.lastActivityAt
          ? new Date(token.lastActivityAt).toISOString()
          : null;
        session.user.disabled = token.disabled ?? false;
        session.user.locked = token.locked ?? false;
        session.user.requiresPasswordChange = token.requiresPasswordChange ?? false;
        session.user.expired = token.expired ?? false;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};