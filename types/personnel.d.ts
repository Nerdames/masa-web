import type { Role } from "@prisma/client";

export interface AuthorizedPersonnel {
  id: string;
  name?: string;
  email: string;
  password: string;
  staffCode?: string;
  disabled: boolean;
  deletedAt?: Date | null;
  lastLogin?: string;
  branchId?: string;
  organizationId: string;
  branchAssignments: BranchAssignment[];
}

export interface BranchAssignment {
  id: string;
  personnelId: string;
  branchId: string;
  role: Role;
}
