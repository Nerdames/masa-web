export interface InventoryItem {
  id: string; // The BranchProduct ID
  productId: string; // The global Product ID
  name: string;
  sku: string;
  category: string;
  categoryId: string; // Needed for the category dropdown
  stock: number;
  sold: number;
  stockLevel: 'In Stock' | 'Low Stock' | 'Out of Stock';
  sellingPrice: number;
  costPrice: number; // Added: For profit margin and ledger entry
  reorderLevel: number;
  unit: string; // Added: e.g., "pcs", "kg"
  vendorId?: string; // Added: For supply chain tracking
  vendorName?: string; // Added: For the UI display
  stockVersion: number; // CRITICAL: For optimistic locking/concurrency
  lastRestockedAt: string | null;
  dateAdded: string;
}

export interface InventoryStats {
  totalStock: number;
  outOfStockCount: number;
  lowStockCount: number; // Added: To track items hitting the reorder point
  shippedCount: number;
  inventoryValue: number;
  potentialProfit?: number; // Optional: (Selling - Cost) * Stock
}

export interface InventoryData {
  stats: InventoryStats;
  alerts: InventoryItem[];
  inventoryList: InventoryItem[];
}