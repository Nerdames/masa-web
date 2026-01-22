export interface UserSession {
  id: string;
  name?: string;
  email: string;
  branchId?: string;
  organizationId: string;
  staffCode?: string;
  role?: string;
}

export interface Account {
  id: string;
  personnelId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
  session_state?: string;
}

export interface Session {
  id: string;
  sessionToken: string;
  personnelId: string;
  expires: Date;
}

export interface VerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}
