import type { Role } from "@prisma/client";

/* ---------------------------------------------
 * Authorized Personnel
 * ------------------------------------------- */
export interface AuthorizedPersonnel {
  id: string;

  name?: string | null;
  email: string;
  password: string;

  staffCode?: string | null;
  disabled: boolean;

  deletedAt?: string | null;
  lastLogin?: string | null;

  organizationId: string;
  branchId?: string | null;

  createdAt: string;
  updatedAt: string;

  branchAssignments: BranchAssignment[];
}

/* ---------------------------------------------
 * Branch Assignment
 * ------------------------------------------- */
export interface BranchAssignment {
  id: string;
  personnelId: string;
  branchId: string;
  role: Role;
}
