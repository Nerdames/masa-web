"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions,
} from "chart.js";

import { useEffect, useState } from "react";
import SalesChart from "@/modules/sales/components/SalesChart";
import RecentOrders from "@/modules/sales/components/RecentOrders";
import { NotificationList, Notification } from "@/core/components/notifications/NotificationCard";
import Summary, { SummaryCard } from "@/core/components/ui/Summary";

/* ---------------- ChartJS ---------------- */
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

/* ---------------- API Types ---------------- */
interface OverviewData {
  summaryCards: SummaryCard[];
  salesData: ChartData<"line", number[], string>;
  salesOptions?: ChartOptions<"line">;
  popularItems: {
    id: string;
    name: string;
    category: string;
    price: number;
    // UPDATED: image is now required, and the API should provide a dynamic generated URL.
    image: string; 
    orders: number;
  }[];
  recentOrders: {
    id: string;
    customer: string;
    items: string;
    date: string;
    total: number;
    status: "Completed" | "Pending" | "Cancelled";
  }[];
  notifications: Notification[];
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOverview() {
      try {
        const res = await fetch("/api/dashboard/overview");
        if (!res.ok) throw new Error("Failed to fetch dashboard data");
        const data: OverviewData = await res.json();
        setOverview(data);
      } catch (err: any) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchOverview();
  }, []);

  const handleMarkRead = (id: string) => {
    // Mark notification as read locally
    if (!overview) return;
    const updatedNotifications = overview.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    setOverview({ ...overview, notifications: updatedNotifications });
  };

  if (loading)
    return <div className="p-4 text-gray-500">Loading dashboard...</div>;
  if (error || !overview)
    return <div className="p-4 text-red-500">{error || "Failed to load dashboard data"}</div>;

  return (
    <div className="p-4 grid grid-cols-12 gap-3">
      {/* ---------------- Left/Main Column ---------------- */}
      <div className="col-span-12 lg:col-span-8 space-y-3">
        {/* Summary Cards */}
        <Summary cardsData={overview.summaryCards} />

        {/* Sales Chart */}
        <SalesChart data={overview.salesData} options={overview.salesOptions} />

        {/* Recent Orders */}
        <RecentOrders orders={overview.recentOrders} />
      </div>

      {/* ---------------- Right Column ---------------- */}
      <div className="col-span-12 lg:col-span-4 space-y-3">


        {/* Notifications */}
        <div className="bg-white rounded-xl shadow p-3">
          <NotificationList
            notifications={overview.notifications}
            onMarkRead={handleMarkRead}
          />
        </div>

        {/* Popular Items */}
        
      </div>
    </div>
  );
}