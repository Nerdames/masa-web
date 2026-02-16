import { useState, useEffect, useCallback } from "react";
import type { ChartDataSales } from "@/components/dashboard/SalesChart";
import type { ChartDataPayment } from "@/components/dashboard/RecentOrders";
import type { ChartDataProduct } from "@/components/dashboard/PopularItems";
import type { Notification } from "@/components/dashboard/NotificationCard";

/* ===============================
   Types
================================ */

export type DashboardStat = {
  label: string;
  value: string;
};

/* ===============================
   Safe Fetch Helper
================================ */

async function safeFetch<T>(url: string, defaultValue: T): Promise<T> {
  try {
    const res = await fetch(url, { credentials: "include" });

    if (!res.ok) {
      console.warn(`safeFetch warning: ${url} returned ${res.status}`);
      return defaultValue;
    }

    const data = await res.json();
    return data ?? defaultValue;
  } catch (err) {
    console.error(`safeFetch error for ${url}:`, err);
    return defaultValue;
  }
}

/* ===============================
   Hook
================================ */

export function useDashboardData() {
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [salesData, setSalesData] = useState<ChartDataSales[]>([]);
  const [paymentData, setPaymentData] = useState<ChartDataPayment[]>([]);
  const [productData, setProductData] = useState<ChartDataProduct[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* ===============================
     Fetchers
  ================================ */

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const statsJson = await safeFetch<DashboardStat[]>(
        "/api/dashboard/stats",
        []
      );

      setStats(
        Array.isArray(statsJson) && statsJson.length
          ? statsJson
          : [
              { label: "Orders", value: "0" },
              { label: "Sales", value: "0" },
              { label: "Products", value: "0" },
              { label: "Notifications", value: "0" },
            ]
      );
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchCharts = useCallback(async () => {
    setLoadingCharts(true);
    try {
      const [salesJson, paymentsJson] = await Promise.all([
        safeFetch<ChartDataSales[]>("/api/dashboard/sales", []),
        safeFetch<ChartDataPayment[]>("/api/dashboard/payments", []),
      ]);

      setSalesData(Array.isArray(salesJson) ? salesJson : []);
      setPaymentData(Array.isArray(paymentsJson) ? paymentsJson : []);
    } finally {
      setLoadingCharts(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const productsJson = await safeFetch<ChartDataProduct[]>(
        "/api/dashboard/products",
        []
      );

      setProductData(Array.isArray(productsJson) ? productsJson : []);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const notifJson = await safeFetch<{ notifications: Notification[] }>(
        "/api/notifications",
        { notifications: [] }
      );

      setNotifications(
        Array.isArray(notifJson.notifications)
          ? notifJson.notifications
          : []
      );
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    await Promise.all([
      fetchStats(),
      fetchCharts(),
      fetchProducts(),
      fetchNotifications(),
    ]);
  }, [fetchStats, fetchCharts, fetchProducts, fetchNotifications]);

  /* ===============================
     Refresh
  ================================ */

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboardData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchDashboardData]);

  /* ===============================
     Mark All Notifications Read
  ================================ */

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (!unread.length) return;

    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
        credentials: "include",
      });

      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true }))
        );
      }
    } catch (err) {
      console.error("markAllNotificationsRead error:", err);
    }
  }, [notifications]);

  /* ===============================
     Initial Fetch
  ================================ */

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    stats,
    salesData,
    paymentData,
    productData,
    notifications,
    unreadCount,
    loadingStats,
    loadingCharts,
    loadingProducts,
    loadingNotifications,
    refreshing,
    handleRefresh,
    markAllNotificationsRead,
  };
}
