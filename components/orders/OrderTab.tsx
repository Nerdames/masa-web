import type { OrderStatus } from "@prisma/client"; // Use your Prisma enum

export type TabType = "LIST" | "DETAIL" | "NEW";

export type OrderTab = {
  id: string;
  title: string;
  type: TabType;
  orderStatus?: OrderStatus; // only for DETAIL tabs
  pinned?: boolean;          // LIST tabs like "Orders" are pinned
  dirty?: boolean;           // NEW or edited tabs
};
