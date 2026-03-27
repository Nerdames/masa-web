// @/modules/branches/components/types.ts
import { Role } from "@prisma/client";

export interface BranchPersonnelDTO {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  staffCode: string | null;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  active: boolean;
  deletedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  branchAssignments: {
    id: string;
    role: Role;
    isPrimary: boolean;
    personnel: BranchPersonnelDTO;
  }[];
  _count: {
    personnel: number;
    branchProducts: number;
    orders: number;
    activityLogs: number;
  };
  salesTotal: number; // Enriched by the API
}

export interface BranchSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
}

export interface BranchListResponse {
  data: Branch[];
  summary: BranchSummary;
  recentLogs: any[];
  page: number;
  pageSize: number;
}

export interface UpdateBranchPayload {
  id: string;
  name?: string;
  location?: string;
  active?: boolean;
  deletedAt?: string | null;
}