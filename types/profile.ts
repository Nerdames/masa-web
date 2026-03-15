export type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

export interface BranchAssignmentDTO {
  branchId: string;
  branchName: string;
  branchLocation: string | null;
  role: Role;
}

export interface ActivityLogDTO {
  id: string;
  action: string;
  createdAt: string;
}

export interface ProfileDTO {
  id: string;
  name: string | null;
  email: string;
  staffCode: string | null;
  isOrgOwner: boolean;
  disabled: boolean;
  lastLogin: string | null;
  lastActivityAt: string | null;
  organization: { name: string };
  assignments: BranchAssignmentDTO[];
  activityLogs: ActivityLogDTO[];
  updatedAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}