"use client";

import React from "react";
import OrdersWorkspace from "@/components/orders/OrdersWorkspace";

export default function OrdersPage() {
  // This page simply renders the workspace.
  // The workspace itself handles:
  // - Chrome-style tabs
  // - Draggable tabs
  // - Order list panel
  // - Order detail panels
  return <OrdersWorkspace organizationId={""} branchId={""} personnelId={""} />;
}
