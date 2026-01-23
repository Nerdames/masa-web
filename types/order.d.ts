import type { OrderItem } from "./orderItem";
import type { Invoice } from "./invoice";
import type { Customer } from "./customer";
import type { AuthorizedPersonnel } from "./personnel";
import type { Branch } from "./domain";
import type { OrderStatus } from "./enums";

/* ---------------------------------------------
 * Order
 * ------------------------------------------- */
export interface Order {
  id: string;
  organizationId: string;
  branchId: string;
  personnelId: string;
  customerId?: string | null;

  total: number;
  paidAmount: number;
  balance: number;
  currency: string;
  status: OrderStatus;

  dueDate?: string | null;        // new field
  paymentTerms?: string | null;   // new field
  notes?: string | null;          // new field

  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  /* ---------------------------------------------
   * Relations
   * ------------------------------------------- */
  items: OrderItem[];
  invoices: Invoice[];

  customer?: Customer | null;
  personnel: AuthorizedPersonnel;
  branch: Branch;
}
