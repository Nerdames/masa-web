import type { Role } from "@prisma/client";

/* ------------------------------------------
 * NextAuth user session object
 * Mirrors AuthorizedPersonnel model
 * ------------------------------------------ */
export interface UserSession {
  id: string;

  name?: string | null;
  email: string;
  staffCode?: string | null;

  role?: Role;        // strict Prisma Role enum
  isOrgOwner?: boolean;

  organizationId: string;
  organizationName?: string | null;

  branchId?: string | null;
  branchName?: string | null;

  lastLogin?: Date | null; // Prisma stores as Date
}

/* ------------------------------------------
 * OAuth / credentials account
 * Mirrors Prisma Account model
 * ------------------------------------------ */
export interface Account {
  id: string;
  personnelId: string;

  type: "oauth" | "credentials"; // stricter than string
  provider: string;               // optionally narrow to known providers
  providerAccountId: string;

  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null; // seconds since epoch
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

/* ------------------------------------------
 * Active session
 * Mirrors Prisma Session model
 * ------------------------------------------ */
export interface Session {
  id: string;
  sessionToken: string;
  personnelId: string;
  expires: Date;
}

/* ------------------------------------------
 * Email / password reset tokens
 * Mirrors Prisma VerificationToken model
 * ------------------------------------------ */
export interface VerificationToken {
  identifier: string; // usually email
  token: string;
  expires: Date;
}
