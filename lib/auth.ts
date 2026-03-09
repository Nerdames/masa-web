import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
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
      disabled?: boolean;
      locked?: boolean;
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
    disabled?: boolean;
    locked?: boolean;
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
    lastActivityAt: number; // timestamp
    disabled?: boolean;
    locked?: boolean;
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const personnel = await prisma.authorizedPersonnel.findFirst({
          where: {
            email: credentials.email,
            deletedAt: null,
          },
          include: {
            organization: true,
            branch: true,
            branchAssignments: true,
          },
        });

        const now = new Date();

        if (!personnel) {
          // Log failed attempt for unknown email
          await prisma.activityLog.create({
            data: {
              organizationId: "system",
              action: "LOGIN_FAILED_UNKNOWN_USER",
              meta: JSON.stringify({ email: credentials.email }),
              createdAt: now,
            },
          });
          return null;
        }

        // Disabled or locked
        if (personnel.disabled || personnel.isLocked || (personnel.lockoutUntil && personnel.lockoutUntil > now)) {
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
              meta: JSON.stringify({ reason: lockReason }),
              createdAt: now,
            },
          });

          throw new Error(lockReason);
        }

        // Password verification
        const isValid = await bcrypt.compare(credentials.password, personnel.password);
        if (!isValid) {
          const attempts = personnel.failedLoginAttempts + 1;
          const lockout =
            attempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + 15 * 60 * 1000)
              : null;

          await prisma.authorizedPersonnel.update({
            where: { id: personnel.id },
            data: { failedLoginAttempts: attempts, lockoutUntil: lockout },
          });

          await prisma.activityLog.create({
            data: {
              organizationId: personnel.organizationId,
              branchId: personnel.branchId,
              personnelId: personnel.id,
              action: "LOGIN_FAILED",
              meta: JSON.stringify({ failedAttempts: attempts }),
              createdAt: now,
            },
          });

          throw new Error("CredentialsSignin");
        }

        // Determine effective role
        let effectiveRole: Role | null = null;
        if (personnel.isOrgOwner) effectiveRole = Role.ADMIN;
        else if (personnel.branchAssignments.length > 0) {
          const primaryAssignment = personnel.branchAssignments.find((ba) => ba.branchId === personnel.branchId);
          effectiveRole = primaryAssignment?.role ?? personnel.branchAssignments[0].role;
        }

        if (!effectiveRole) return null;

        // Reset failed attempts & update lastLogin/lastActivity
        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: {
            lastLogin: now,
            lastActivityAt: now,
            failedLoginAttempts: 0,
            lockoutUntil: null,
          },
        });

        // Log successful login
        await prisma.activityLog.create({
          data: {
            organizationId: personnel.organizationId,
            branchId: personnel.branchId,
            personnelId: personnel.id,
            action: "LOGIN_SUCCESS",
            meta: JSON.stringify({ role: effectiveRole }),
            createdAt: now,
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
          branchId: personnel.branchId ?? null,
          branchName: personnel.branch?.name ?? null,
          lastLogin: now.toISOString(),
          lastActivityAt: now.toISOString(),
          disabled: personnel.disabled,
          locked: personnel.isLocked,
        };
      },
    }),
  ],

  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },

  callbacks: {
    async jwt({ token, user, trigger, session }) {
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
        };
      }

      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      if (token.id) {
        const idleTime = now - (token.lastActivityAt || 0);

        if (idleTime > INACTIVITY_TIMEOUT_MS) return {};

        if (idleTime > DB_UPDATE_THROTTLE_MS) {
          try {
            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date() },
            });
            token.lastActivityAt = now;
          } catch (error) {
            console.error("Failed to update lastActivityAt:", error);
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
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};