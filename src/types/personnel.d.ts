import type { Role } from "@prisma/client";
import type { Branch } from "./domain";
import type { Organization } from "./organization";
import type { Order } from "./order";
import type { ActivityLog } from "./activityLog";
import type { Notification } from "./notification";
import type { StockMovement } from "./stockMovement";
import type { Account } from "./account";
import type { Session } from "./session";
import type { Sale } from "./sale";
import type { Invoice } from "./invoice";

/* ---------------------------------------------
 * Authorized Personnel
 * Mirrors Prisma AuthorizedPersonnel model
 * ------------------------------------------- */
export interface AuthorizedPersonnel {
  id: string;

  name?: string | null;
  email: string;
  password: string;

  staffCode?: string | null;
  disabled: boolean;

  deletedAt?: Date | null;
  lastLogin?: Date | null;

  organizationId: string;
  branchId?: string | null;

  isOrgOwner: boolean;

  createdAt: Date;
  updatedAt: Date;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  branchAssignments?: BranchAssignment[];
  organization?: Organization;
  branch?: Branch | null;

  orders?: Order[];
  activityLogs?: ActivityLog[];
  notifications?: Notification[];
  stockMoves?: StockMovement[];
  accounts?: Account[];
  sessions?: Session[];
  ownedOrganizations?: Organization[];

  salesAttended?: Sale[];
  invoicesPaid?: Invoice[];
}

/* ---------------------------------------------
 * Branch Assignment
 * Mirrors Prisma BranchAssignment model
 * ------------------------------------------- */
export interface BranchAssignment {
  id: string;
  personnelId: string;
  branchId: string;
  role: Role;

  /* ---------------------------------------------
   * Relations (optional — Prisma include-based)
   * ------------------------------------------- */
  personnel?: AuthorizedPersonnel;
  branch?: Branch;
}
