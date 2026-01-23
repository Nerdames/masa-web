import type { Role } from "@prisma/client";

/**
 * Session user object
 * Injected via NextAuth callbacks
 */
export interface UserSession {
  id: string;

  name?: string | null;
  email: string;

  organizationId: string;
  branchId?: string | null;

  staffCode?: string | null;
  role?: Role;
}

/**
 * OAuth / credentials account
 * Mirrors Prisma Account model
 */
export interface Account {
  id: string;

  personnelId: string;

  type: string;
  provider: string;
  providerAccountId: string;

  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

/**
 * Active session
 * Mirrors Prisma Session model
 */
export interface Session {
  id: string;

  sessionToken: string;
  personnelId: string;

  expires: Date;
}

/**
 * Email / password reset tokens
 * Mirrors Prisma VerificationToken
 */
export interface VerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}
