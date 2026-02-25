import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { Role } from "@/types/enums";

/* ------------------------------------------
 * Module augmentation for NextAuth
 * ------------------------------------------ */
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      role?: Role;
      isOrgOwner?: boolean;
      organizationId?: string;
      organizationName?: string | null;
      branchId?: string | null;
      branchName?: string | null;
      lastLogin?: string | null;
      lastActivityAt?: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: Role;
    isOrgOwner: boolean;
    organizationId: string;
    organizationName?: string | null;
    branchId?: string | null;
    branchName?: string | null;
    lastLogin?: string | null;
    lastActivityAt?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    isOrgOwner?: boolean;
    organizationId?: string;
    organizationName?: string | null;
    branchId?: string | null;
    branchName?: string | null;
    lastLogin?: string | null;
    lastActivityAt?: number; // store as timestamp (ms)
  }
}

/* ------------------------------------------
 * Inactivity timeout configuration
 * ------------------------------------------ */
const INACTIVITY_TIMEOUT_MINUTES = 60; // 1 hour

/* ------------------------------------------
 * NextAuth configuration
 * ------------------------------------------ */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

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
            disabled: false,
            deletedAt: null,
          },
          include: {
            organization: true,
            branch: true,
            branchAssignments: true,
          },
        });

        if (!personnel) return null;

        const isValid = await bcrypt.compare(credentials.password, personnel.password);
        if (!isValid) return null;

        // ----------------------------
        // Determine effective role
        // ----------------------------
        let effectiveRole: Role | null = null;

        if (personnel.isOrgOwner) effectiveRole = "ADMIN";

        if (!effectiveRole && personnel.branchId) {
          const assignment = personnel.branchAssignments.find(
            (ba) => ba.branchId === personnel.branchId
          );
          if (assignment) effectiveRole = assignment.role;
        }

        if (!effectiveRole && personnel.branchAssignments.length > 0)
          effectiveRole = personnel.branchAssignments[0].role;

        if (!effectiveRole) return null;

        const now = new Date();

        // ----------------------------
        // Update last login & last activity
        // ----------------------------
        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: { lastLogin: now, lastActivityAt: now },
        });

        // ----------------------------
        // Return NextAuth user object
        // ----------------------------
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
        };
      },
    }),
  ],

  pages: { signIn: "/auth/signin", error: "/auth/signin" },

  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();

      if (user) {
        // First login
        token.id = user.id;
        token.role = user.role;
        token.isOrgOwner = user.isOrgOwner;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName ?? null;
        token.branchId = user.branchId ?? null;
        token.branchName = user.branchName ?? null;
        token.lastLogin = user.lastLogin ?? null;
        token.lastActivityAt = now;
      } else if (token.id) {
        // Refresh JWT on subsequent requests
        const personnel = await prisma.authorizedPersonnel.findUnique({
          where: { id: token.id },
          select: { lastActivityAt: true },
        });

        const lastActivity = personnel?.lastActivityAt?.getTime() ?? 0;

        if (now - lastActivity > INACTIVITY_TIMEOUT_MINUTES * 60 * 1000) {
          // Inactivity timeout exceeded → invalidate token
          return {};
        }

        // Update lastActivityAt if still active
        await prisma.authorizedPersonnel.update({
          where: { id: token.id },
          data: { lastActivityAt: new Date() },
        });

        token.lastActivityAt = now;
      }

      return token;
    },

    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.isOrgOwner = token.isOrgOwner ?? false;
        session.user.organizationId = token.organizationId ?? "";
        session.user.organizationName = token.organizationName ?? null;
        session.user.branchId = token.branchId ?? null;
        session.user.branchName = token.branchName ?? null;
        session.user.lastLogin = token.lastLogin ?? null;
        session.user.lastActivityAt = token.lastActivityAt
          ? new Date(token.lastActivityAt).toISOString()
          : null;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};