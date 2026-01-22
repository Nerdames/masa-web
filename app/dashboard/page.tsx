"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useRef } from "react";

import ConfirmModal from "@/components/modal/ConfirmModal";
import StatCard from "@/components/dashboard/StatCard";
import QuickAction from "@/components/dashboard/QuickAction";
import ChartSales from "@/components/dashboard/ChartSales";
import ChartPayments from "@/components/dashboard/ChartPayments";
import ProductRow from "@/components/dashboard/ProductRow";
import NotificationCard from "@/components/dashboard/NotificationCard";
import { quickActionsMap } from "@/lib/quickActions";

import { useDashboardData } from "../hooks/useDashboardData";

// ----------------- Skeletons -----------------
const SkeletonCard = () => <div className="bg-gray-100 animate-pulse rounded-xl p-4 h-36" />;
const SkeletonButton = () => <div className="bg-gray-100 h-10 w-32 rounded-lg animate-pulse" />;
const SkeletonNotification = () => <div className="bg-gray-100 h-5 w-full rounded animate-pulse mb-2" />;

export default function DashboardHome() {
  // ----------------- Session -----------------
  const { data: session, status } = useSession();
  const user = session?.user;

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // ----------------- Dropdown Refs -----------------
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userDropdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifDropdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userDropdownVisible, setUserDropdownVisible] = useState(false);
  const [notifDropdownVisible, setNotifDropdownVisible] = useState(false);

  // ----------------- Dashboard Data -----------------
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

  // ----------------- Fail-safe Skeleton Render -----------------
  if (status === "loading") {
    return (
      <div className="p-6 space-y-6 bg-gray-50 h-full overflow-y-auto">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-gray-500">
        You must be signed in to view the dashboard.
      </div>
    );
  }

  const dashboardTitle = user.organizationName
    ? `Dashboard : ${user.organizationName}`
    : "Dashboard";

  const startAutoCloseTimer = (
    setVisible: (v: boolean) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 4000);
  };

  const cancelAutoCloseTimer = (
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut({ callbackUrl: "/" });
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 h-full overflow-y-auto">
      {/* Header */}
      <motion.div
        className="flex justify-between items-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-2xl font-bold text-black">{dashboardTitle}</h1>
          <p className="text-gray-600">Welcome to the MASA Management System.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded transition text-sm text-black"
            title="Refresh Dashboard"
          >
            {refreshing ? (
              <span className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-black rounded-full"></span>
            ) : (
              <i className="bx bx-refresh text-black text-lg"></i>
            )}
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingStats
          ? Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((stat, i) => <StatCard key={i} {...stat} />)}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSales data={salesData} loading={loadingCharts} />
        <ChartPayments data={paymentData} loading={loadingCharts} />
      </div>

      {/* Top Products */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3 text-black">Top Products</h3>
        {loadingProducts || productData.length === 0 ? (
          <p className="text-gray-400 text-center py-10">No product data available.</p>
        ) : (
          <ul className="space-y-2 text-gray-700">
            {productData.slice(0, 5).map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </ul>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-black">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          {loadingStats
            ? Array(3).fill(0).map((_, i) => <SkeletonButton key={i} />)
            : quickActionsMap[user.role]?.map((action, i) => (
                <QuickAction key={i} {...action} />
              ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-black">Recent Notifications</h3>
          <div className="flex items-center gap-2">
            <Link className="text-blue-600 text-sm hover:underline" href="/dashboard/notifications">
              View All
            </Link>
            {unreadCount > 0 && (
              <button
                onClick={markAllNotificationsRead}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition"
                title="Mark all as read"
              >
                <i className="bx bx-check-double text-black text-lg"></i>
              </button>
            )}
          </div>
        </div>
        {loadingNotifications
          ? Array(5).fill(0).map((_, i) => <SkeletonNotification key={i} />)
          : notifications.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No notifications yet.</p>
            ) : (
              <ul className="space-y-3">
                {notifications.slice(0, 10).map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onMarkRead={async (id) => {
                      try {
                        const res = await fetch("/api/notifications", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id }),
                          credentials: "include",
                        });
                        if (res.ok)
                          notifications.forEach((notif) => {
                            if (notif.id === id) notif.read = true;
                          });
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  />
                ))}
              </ul>
            )}
      </div>

      {/* Sign Out Confirmation */}
      <ConfirmModal
        open={showSignOutConfirm}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={handleSignOut}
      />
    </div>
  );
}
