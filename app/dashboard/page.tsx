"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

import Summary, { SummaryCard } from "@/components/ui/Summary";
import ChartSales from "@/components/dashboard/ChartSales";
import ChartPayments from "@/components/dashboard/ChartPayments";
import ProductRow from "@/components/dashboard/ProductRow";
import NotificationCard from "@/components/dashboard/NotificationCard";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Tooltip } from "@/components/feedback/Tooltip";

import { useDashboardData } from "../hooks/useDashboardData";

export default function DashboardHome() {
  const { data: session } = useSession();
  const user = session?.user;

  const {
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
  } = useDashboardData();

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        You must be signed in to view the dashboard.
      </div>
    );
  }

  /* ================= SUMMARY ADAPTER ================= */
  const summaryCards: SummaryCard[] = stats.map((stat) => ({
    id: stat.label.toLowerCase().replace(/\s+/g, "-"),
    title: stat.label,
    value: Number(stat.value) || 0,
    filter: stat.label.toLowerCase(),
    isCurrency: stat.label === "Sales",
    color:
      stat.label === "Sales"
        ? "text-green-600"
        : stat.label === "Orders"
        ? "text-blue-600"
        : stat.label === "Products"
        ? "text-purple-600"
        : undefined,
  }));

  return (
    <>
      {/* ================= Fixed Refresh Button (Always Visible) ================= */}
      <div className="fixed top-20 right-6 z-[20]">
        <Tooltip content="Refresh dashboard" side="left">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-11 h-11 rounded-full bg-white shadow-lg border border-gray-200
                       flex items-center justify-center
                       hover:bg-gray-100 transition-all
                       disabled:opacity-50"
          >
            {refreshing ? (
              <span className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-black rounded-full" />
            ) : (
              <i className="bx bx-refresh text-xl text-gray-700" />
            )}
          </button>
        </Tooltip>
      </div>

      {/* ================= Scrollable Content ================= */}
      <div className="p-6 space-y-6 bg-gray-50 h-full overflow-y-auto">

        {/* ================= SUMMARY ================= */}
        <Summary cardsData={summaryCards} loading={loadingStats} />

        {/* ================= Charts ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSales data={salesData} loading={loadingCharts} />
          <ChartPayments data={paymentData} loading={loadingCharts} />
        </div>

        {/* ================= Top Products ================= */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Top Products</h3>

          {loadingProducts || productData.length === 0 ? (
            <p className="text-gray-400 text-center py-10">
              No product data available.
            </p>
          ) : (
            <ul className="space-y-2">
              {productData.slice(0, 5).map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </ul>
          )}
        </div>

        {/* ================= Notifications ================= */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Recent Notifications</h3>

            {unreadCount > 0 && (
              <Tooltip content="Mark all as read" side="left">
                <button
                  onClick={markAllNotificationsRead}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition"
                >
                  <i className="bx bx-check-double text-lg" />
                </button>
              </Tooltip>
            )}
          </div>

          {loadingNotifications ? (
            <p className="text-gray-400 text-center py-10">
              Loading notifications…
            </p>
          ) : notifications.length === 0 ? (
            <p className="text-gray-400 text-center py-10">
              No notifications yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {notifications.slice(0, 10).map((n) => (
                <NotificationCard key={n.id} notification={n} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ================= Sign Out Confirm ================= */}
      <ConfirmModal
        open={showSignOutConfirm}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={() => signOut({ callbackUrl: "/" })}
      />
    </>
  );
}
