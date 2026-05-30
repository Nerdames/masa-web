import type { StockMovementType } from "./enums";
import type { BranchProduct } from "./product";
import type { Branch } from "./domain";
import type { AuthorizedPersonnel } from "./personnel";

/* ---------------------------------------------
 * StockMovement
 * Mirrors Prisma StockMovement model
 * ------------------------------------------- */
export interface StockMovement {
  id: string;
  branchProductId: string;
  branchId: string;
  personnelId: string;

  type: StockMovementType;
  quantity: number;
  referenceId?: string | null; // matches Prisma field

  createdAt: Date;

  /* ---------------------------------------------
   * Relations (optional – Prisma include-based)
   * ------------------------------------------- */
  branchProduct?: BranchProduct;
  branch?: Branch;
  personnel?: AuthorizedPersonnel;
}
