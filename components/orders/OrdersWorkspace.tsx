"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DropResult } from "@hello-pangea/dnd";

import OrdersTabBar from "./OrdersTabBar";
import OrderListPanel from "./OrderListPanel";
import OrderDetailPanel from "./OrderDetailPanel";
import NewOrderPanel from "./NewOrderPanel";
import type { OrderTab } from "./OrderTab";
import type { OrderStatus } from "@prisma/client";

/* ============================
   CONSTANTS
============================ */
const MAX_TABS = 10;

/* ============================
   LOCAL STORAGE KEY
============================ */
const storageKey = (orgId: string, branchId: string, personnelId: string) =>
  `masa:orders:tabs:${orgId}:${branchId}:${personnelId}`;

/* ============================
   PROPS
============================ */
type Props = {
  organizationId: string;
  branchId: string;
  personnelId: string;
};

/* ============================
   COMPONENT
============================ */
export default function OrdersWorkspace({
  organizationId,
  branchId,
  personnelId,
}: Props) {
  /* ----------------------------
     INITIAL STATE WITH PINNED TAB
  ---------------------------- */
  const initialTabs: OrderTab[] = [{ id: "orderlist", title: "Orders", type: "LIST", pinned: true }];

  const [tabs, setTabs] = useState<OrderTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState("orderlist");
  const [toast, setToast] = useState<string | null>(null);

  /* ----------------------------
     LOAD TABS FROM LOCAL STORAGE
  ---------------------------- */
  useEffect(() => {
    const raw = localStorage.getItem(storageKey(organizationId, branchId, personnelId));
    if (raw) {
      try {
        const parsed: OrderTab[] = JSON.parse(raw);
        const mergedTabs = [
          ...initialTabs,
          ...parsed.filter((t) => t.id !== "orderlist"),
        ];
        setTabs(mergedTabs);

        if (!mergedTabs.find((t) => t.id === activeTabId)) {
          setActiveTabId("orderlist");
        }
      } catch (err) {
        console.warn("Failed to parse stored tabs:", err);
      }
    }
  }, [organizationId, branchId, personnelId]);

  /* ----------------------------
     SAVE TABS TO LOCAL STORAGE
  ---------------------------- */
  useEffect(() => {
    localStorage.setItem(
      storageKey(organizationId, branchId, personnelId),
      JSON.stringify(tabs)
    );
  }, [tabs, organizationId, branchId, personnelId]);

  /* ----------------------------
     TOAST
  ---------------------------- */
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  /* ----------------------------
     TAB ACTIONS
  ---------------------------- */
  const openOrderTab = useCallback(
    (order: { id: string; reference: string; status: OrderStatus }) => {
      setTabs((prev) => {
        if (prev.find((t) => t.id === order.id)) return prev;

        if (prev.length >= MAX_TABS) {
          showToast("Maximum tabs reached");
          return prev;
        }

        return [
          ...prev,
          {
            id: order.id,
            title: `Order ${order.reference}`,
            type: "DETAIL",
            orderStatus: order.status,
            pinned: false,
          },
        ];
      });
      setActiveTabId(order.id);
    },
    []
  );

  const createNewOrderTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      showToast("Maximum tabs reached");
      return;
    }
    const id = `neworder-${Date.now()}`;
    setTabs((prev) => [
      ...prev,
      { id, title: "New Order", type: "NEW", pinned: false },
    ]);
    setActiveTabId(id);
  }, [tabs.length]);

  const closeTab = (tab: OrderTab) => {
    setTabs((prev) => prev.filter((t) => t.id !== tab.id));
    if (activeTabId === tab.id) setActiveTabId("orderlist");
  };

  const requestCloseTab = (tab: OrderTab) => {
    if (tab.pinned) return;
    closeTab(tab);
  };

  /* ----------------------------
     DRAG & DROP REORDERING
  ---------------------------- */
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === 0 || result.destination.index === 0) return;

    const reordered = [...tabs];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setTabs(reordered);
  };

  /* ----------------------------
     ACTIVE PANEL
  ---------------------------- */
  const ActivePanel = useMemo(() => {
    const tab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
    if (!tab) return null;

    if (tab.type === "LIST")
      return <OrderListPanel onOpenOrder={openOrderTab} onCreateOrder={createNewOrderTab} />;

    if (tab.type === "NEW") return <NewOrderPanel />;

    return (
      <OrderDetailPanel
        orderId={tab.id}
        onStatusChange={(status: OrderStatus) =>
          setTabs((prev) =>
            prev.map((t) => (t.id === tab.id ? { ...t, orderStatus: status } : t))
          )
        }
      />
    );
  }, [tabs, activeTabId, openOrderTab, createNewOrderTab]);

  /* ----------------------------
     RENDER
  ---------------------------- */
  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <OrdersTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        setActiveTabId={setActiveTabId}
        createNewOrderTab={createNewOrderTab}
        requestCloseTab={requestCloseTab}
        onDragEnd={onDragEnd}
      />

      <div className="flex-1 overflow-y-auto bg-white p-4">{ActivePanel}</div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#323232] text-white text-sm px-4 py-2 rounded shadow">
          {toast}
        </div>
      )}
    </div>
  );
}
