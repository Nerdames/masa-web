import type { OrderItem } from "./orderItem";
import type { Invoice } from "./invoice";
import type { Customer } from "./customer";
import type { AuthorizedPersonnel } from "./personnel";
import type { Branch } from "./domain";
import type { Sale } from "./sale"; // <-- imported Sale
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

  dueDate?: string | null;        // optional due date
  paymentTerms?: string | null;   // optional payment terms
  notes?: string | null;          // optional notes

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

  sales: Sale[]; // fully typed
}
