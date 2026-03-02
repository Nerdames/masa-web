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
    lastActivityAt?: number; // timestamp in ms
  }
}

/* ------------------------------------------
 * Inactivity timeout configuration
 * ------------------------------------------ */
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------
 * NextAuth configuration
 * ------------------------------------------ */
export const authOptions: NextAuthOptions = {
  session: { 
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hour total session duration
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
          where: { email: credentials.email, disabled: false, deletedAt: null },
          include: { organization: true, branch: true, branchAssignments: true },
        });

        if (!personnel) return null;

        const isValid = await bcrypt.compare(credentials.password, personnel.password);
        if (!isValid) return null;

        // Determine effective role
        let effectiveRole: Role | null = null;
        if (personnel.isOrgOwner) effectiveRole = "ADMIN" as Role;
        
        if (!effectiveRole && personnel.branchId) {
          const assignment = personnel.branchAssignments.find((ba) => ba.branchId === personnel.branchId);
          if (assignment) effectiveRole = assignment.role as Role;
        }
        
        if (!effectiveRole && personnel.branchAssignments.length > 0)
          effectiveRole = personnel.branchAssignments[0].role as Role;

        if (!effectiveRole) return null;

        const now = new Date();

        // Initial login audit
        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: { lastLogin: now, lastActivityAt: now },
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
        };
      },
    }),
  ],

  pages: { 
    signIn: "/auth/signin", 
    error: "/auth/signin" 
  },

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const now = Date.now();

      // 1. Handle initial Sign In
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
        };
      }

      // 2. Handle manual session updates (client-side update())
      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      // 3. Inactivity Logic & DB Throttling
      if (token.id) {
        const lastActivity = token.lastActivityAt || 0;
        const idleTime = now - lastActivity;

        // If user has been idle for > 1 hour, wipe token (401)
        if (idleTime > INACTIVITY_TIMEOUT_MS) {
          return {}; 
        }

        // If user is active, only update DB if 5 mins have passed since last write
        if (idleTime > DB_UPDATE_THROTTLE_MS) {
          try {
            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date() },
            });
            // Update token timestamp so we don't hit DB again for another 5 mins
            token.lastActivityAt = now;
          } catch (error) {
            console.error("Inactivity background update failed:", error);
            // We don't return {} here so a DB hiccup doesn't log the user out
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && token.id) {
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