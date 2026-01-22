import type { StockMovementType } from "./enums";

/* ---------------------------------------------
 * StockMovement
 * ------------------------------------------- */
export interface StockMovement {
  id: string;
  branchProductId: string;
  branchId?: string | null;
  personnelId?: string | null;
  type: StockMovementType;
  quantity: number;
  note?: string | null;
  createdAt: string;
}
