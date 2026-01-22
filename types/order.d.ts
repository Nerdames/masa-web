import type { OrderStatus } from "@prisma/client";

export interface Order {
  id: string;
  organizationId: string;
  branchId: string;
  personnelId: string;
  customerId?: string;
  total: number;
  paidAmount: number;
  balance: number;
  currency: string;
  status: OrderStatus;
  deletedAt?: Date | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  invoices: Invoice[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  branchProductId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Invoice {
  id: string;
  orderId: string;
  total: number;
  paid: boolean;
  currency: string;
  createdAt: string;
}
