/* ---------------------------------------------
 * Receipt
 * Mirrors Prisma Receipt model
 * ------------------------------------------- */
export interface Receipt {
  id: string;
  saleId: string;
  cashierId: string;
  branchId: string;
  branchProductId: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  currency: string;
  createdAt: Date;

  /* ---------------------------------------------
   * Relations (optional – Prisma include-based)
   * ------------------------------------------- */
  sale?: Sale;
  invoice?: Invoice;
  cashier?: AuthorizedPersonnel;
  branch?: Branch;
  branchProduct?: BranchProduct;
  organization?: Organization;
}
