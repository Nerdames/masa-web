import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions, DefaultSession, DefaultUser } from "next-auth";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/core/lib/prisma";
import { Role, ActorType, Severity, Prisma } from "@prisma/client";

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

  await tx.activityLog.create({
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
      },
      async authorize(credentials, req) {
        if (!credentials?.identifier || !credentials?.password) return null;

        // 1. Precise Forensic Extraction (Handles Proxies/Load Balancers)
        const ipAddress = (req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
                          (req?.headers?.["x-real-ip"] as string) || 
                          "127.0.0.1";
        const deviceInfo = (req?.headers?.["user-agent"] as string) || "Unknown Device";
        const input = credentials.identifier.trim();
        const now = new Date();

        // 2. Dual-Path Lookup
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

        if (!personnel) {
          console.warn(`[AUTH_WARN] Unrecognized identity attempt: ${input} from IP: ${ipAddress}`);
          return null;
        }

        // 3. Organization Kill-Switch
        if (personnel.organization && 'active' in personnel.organization && !personnel.organization.active) {
          throw new Error("ORGANIZATION_SUSPENDED");
        }

        // 4. Role & Branch Resolution
        let effectiveRole: Role = personnel.role;
        let activeBranchId: string | null = personnel.branchId;
        let activeBranchName: string | null = personnel.branch?.name ?? null;

        if (personnel.isOrgOwner) {
          effectiveRole = Role.ADMIN;
        } else if (personnel.branchAssignments.length > 0) {
          const primary = personnel.branchAssignments[0];
          effectiveRole = primary.role; 
          activeBranchId = primary.branchId;
          activeBranchName = primary.branch?.name ?? null;
        }

        // 5. Account Block Verification
        const isTemporaryLocked = personnel.lockoutUntil && personnel.lockoutUntil > now;
        
        if (personnel.disabled || personnel.isLocked || isTemporaryLocked) {
          const reason = personnel.disabled ? "ACCOUNT_DISABLED" : 
                         personnel.isLocked ? (personnel.lockReason || "ACCOUNT_LOCKED_ADMIN") : 
                         "TEMPORARY_SECURITY_LOCKOUT";

          await prisma.$transaction(async (tx) => {
            await secureAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: activeBranchId,
              actorId: personnel.id,
              actorRole: effectiveRole,
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

        // 6. Cryptographic Password Verification
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

            await secureAuditLog(tx, {
              organizationId: personnel.organizationId,
              branchId: activeBranchId,
              actorId: personnel.id,
              actorRole: effectiveRole,
              action: "LOGIN_FAILED_PASSWORD",
              severity: shouldLock ? Severity.CRITICAL : Severity.MEDIUM,
              critical: shouldLock,
              ipAddress,
              deviceInfo,
              metadata: { attemptCount: attempts, locked: shouldLock },
            });
          });

          throw new Error("INVALID_CREDENTIALS");
        }

        // 7. Success: Atomic State Reset & Audit
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
            metadata: { loginType: input.includes("@") ? "email" : "staff_code" },
          });
        });

        // 8. Return Validated Session Profile
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
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }): Promise<JWT> {
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
        };
      }

      // Client-Side Force Session Updates
      if (trigger === "update" && session) {
        return { ...token, ...session };
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
              select: { disabled: true, isLocked: true, deletedAt: true }
            });

            // INSTANT KILL-SWITCH: If admin disabled the user mid-session
            if (!personnelState || personnelState.disabled || personnelState.isLocked || personnelState.deletedAt) {
              return { ...token, expired: true, disabled: true, locked: true } as JWT;
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
        session.user.lastActivityAt = new Date(token.lastActivityAt).toISOString();
        session.user.disabled = token.disabled;
        session.user.locked = token.locked;
        session.user.requiresPasswordChange = token.requiresPasswordChange;
        session.user.expired = token.expired || false;
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
          // Note: Generating a new AuditLog hash here outside of a request context 
          // can cause race conditions, so we just update the personnel record gracefully.
        } catch (e) {
          console.error("[AUTH_SIGNOUT_ERROR] Failed to mark final activity", e);
        }
      }
    },
  },

  pages: {
    signIn: "/signin",
    error: "/error",
  },
  
  secret: process.env.NEXTAUTH_SECRET,
};