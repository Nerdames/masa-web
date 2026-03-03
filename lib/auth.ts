import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { Role } from "@prisma/client"; // Use the Prisma-generated Enum

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
  }
}

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DB_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export const authOptions: NextAuthOptions = {
  session: { 
    strategy: "jwt",
    maxAge: 24 * 60 * 60, 
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
            disabled: false, 
            deletedAt: null 
          },
          include: { 
            organization: true, 
            branch: true, 
            branchAssignments: true 
          },
        });

        // 1. Basic Existence Check
        if (!personnel) return null;

        // 2. Security Check (Lockout & Throttling)
        if (personnel.isLocked) throw new Error(`Account locked: ${personnel.lockReason || 'Security concerns'}`);
        if (personnel.lockoutUntil && personnel.lockoutUntil > new Date()) {
            throw new Error("Temporary lockout active. Please try again later.");
        }

        // 3. Password Verification
        const isValid = await bcrypt.compare(credentials.password, personnel.password);
        if (!isValid) {
            // Optional: Increment failedLoginAttempts here if desired
            return null;
        }

        // 4. Role Resolution Logic
        let effectiveRole: Role | null = null;
        
        // Org Owners are always ADMINs globally
        if (personnel.isOrgOwner) {
            effectiveRole = Role.ADMIN;
        } else {
            // Try to find role for the primary branch first
            const primaryAssignment = personnel.branchAssignments.find(
                (ba) => ba.branchId === personnel.branchId
            );
            
            if (primaryAssignment) {
                effectiveRole = primaryAssignment.role;
            } else if (personnel.branchAssignments.length > 0) {
                // Fallback to the first available branch assignment
                effectiveRole = personnel.branchAssignments[0].role;
            }
        }
        
        if (!effectiveRole) return null;

        const now = new Date();

        // 5. Update Audit Fields
        await prisma.authorizedPersonnel.update({
          where: { id: personnel.id },
          data: { 
            lastLogin: now, 
            lastActivityAt: now,
            failedLoginAttempts: 0, // Reset on success
            lockoutUntil: null 
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

      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      if (token.id) {
        const lastActivity = token.lastActivityAt || 0;
        const idleTime = now - lastActivity;

        if (idleTime > INACTIVITY_TIMEOUT_MS) return {}; 

        // Throttle DB activity updates
        if (idleTime > DB_UPDATE_THROTTLE_MS) {
          try {
            await prisma.authorizedPersonnel.update({
              where: { id: token.id },
              data: { lastActivityAt: new Date() },
            });
            token.lastActivityAt = now;
          } catch (error) {
            console.error("Activity update failed:", error);
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
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};