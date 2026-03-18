import { ActivityLog } from "@prisma/client";

export enum Role {
  DEV = "DEV",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  SALES = "SALES",
  INVENTORY = "INVENTORY",
  CASHIER = "CASHIER"
}

export interface Branch {
  id: string;
  name: string;
}

export interface BranchAssignment {
  branchId: string;
  role: Role;
  isPrimary: boolean;
  branch: { name: string };
}

export interface Personnel {
  id: string;
  staffCode: string | null;
  name: string;
  email: string;
  role: Role;
  disabled: boolean;
  isLocked: boolean;
  lockReason?: string | null;
  lastActivityAt: string | null;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  branchAssignments: BranchAssignment[];
}

export interface ProvisionPayload {
  name: string;
  email: string;
  role: Role;
  branchId: string;
  password?: string;
  generatePassword?: boolean;
}

export interface UpdatePayload {
  name?: string;
  email?: string;
  role?: Role;
  disabled?: boolean;
  isLocked?: boolean;
  lockReason?: string | null;
  newPassword?: string;
}

export interface SummaryStats {
  total: number;
  active: number;
  disabled: number;
  locked: number;
}

export interface PaginatedResponse {
  data: Personnel[];
  total: number;
  page: number;
  pageSize: number;
  summary: SummaryStats;
  branchSummaries: { id: string; name: string; count: number }[];
  recentLogs: ActivityLog[];
}

export type AlertType = "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "SYSTEM" | "SECURITY";
export type AlertKind = "TOAST" | "PUSH";

export interface MASAAlert {
  id: string;
  kind: AlertKind;
  type: AlertType;
  title?: string;
  message: string;
  duration?: number;
  approvalId?: string;
}

export type AlertAction = Omit<MASAAlert, "id">;