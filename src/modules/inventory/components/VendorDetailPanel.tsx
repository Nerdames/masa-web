"use client";

import React, { useState } from "react";
import {
  X,
  Maximize2,
  Minimize2,
  Package,
  User,
  Loader2,
  AlertOctagon,
  Archive,
  Phone,
  Mail,
  MapPin,
  Clock,
  Edit3
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types
------------------------- */

interface IVendorPO {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

interface IVendorGRN {
  id: string;
  grnNumber: string;
  createdAt: string;
}

interface IVendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  _count?: {
    purchaseOrders: number;
    grns: number;
  };
  purchaseOrders?: IVendorPO[];
  grns?: IVendorGRN[];
}

interface VendorDetailPanelProps {
  vendor: IVendor;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

/* -------------------------
Component
------------------------- */

export function VendorDetailPanel({
  vendor,
  onClose,
  onEdit,
  onArchive
}: VendorDetailPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const [isArchiving, setIsArchiving] = useState(false);

  const isDeleted = !!vendor.deletedAt;
  const initials = vendor.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

  async function handleArchive() {
    if (isDeleted) return;

    const confirm = window.confirm(
      `Archive vendor "${vendor.name}"? This will hide them from active procurement workflows.`
    );
    if (!confirm) return;

    setIsArchiving(true);
    try {
      await onArchive();
      dispatch?.({
        kind: "PUSH",
        type: "SUCCESS",
        title: "Vendor Archived",
        message: `${vendor.name} has been successfully moved to archives.`
      });
    } catch (err: any) {
      dispatch?.({
        kind: "TOAST",
        type: "ERROR",
        title: "Archive Failed",
        message: err.message
      });
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl relative">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate whitespace-nowrap">
              {vendor.name}
            </h2>
            {isDeleted && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap uppercase">
                Archived
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap font-mono uppercase tracking-tighter">
            REF: {vendor.id.slice(-8)}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={toggleFullScreen}
            className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            {isFullScreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 custom-scrollbar">
        
        {/* Identity & Metrics Section */}
        {/* Layout Switch: Grid for FullScreen, Stacked for SidePanel */}
        <div className={`flex flex-col gap-6 ${isFullScreen ? "md:grid md:grid-cols-2" : ""}`}>
          {/* Vendor Identity Card */}
          <section className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-4">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
              {initials}
            </div>
            <div className="min-w-0">
              <h4 className="text-[9px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-2">
                <User className="w-3 h-3" /> Entity Profile
              </h4>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                {vendor.name}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                <Clock className="w-3 h-3" /> Registered{" "}
                {vendor.createdAt
                  ? new Date(vendor.createdAt).toLocaleDateString()
                  : "N/A"}
              </div>
            </div>
          </section>

          {/* Quick Metrics Layer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Purchase Orders
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {vendor._count?.purchaseOrders || 0}
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm">
              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Total Receipts
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {vendor._count?.grns || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Connectivity Layer */}
        <section className="space-y-4">
          <h4 className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">
            Node Connectivity
          </h4>
          {/* Layout Switch: 3 Columns for FullScreen, 1 Column for SidePanel */}
          <div className={`grid gap-5 ${isFullScreen ? "md:grid-cols-3" : "grid-cols-1"}`}>
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> Email Address
              </span>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                {vendor.email || "Not provided"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> Primary Contact
              </span>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                {vendor.phone || "Not provided"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Base Location
              </span>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2" title={vendor.address || ""}>
                {vendor.address || "No address on file"}
              </p>
            </div>
          </div>
        </section>

        {/* Recent Activity Table */}
        <section className="pb-8">
          <h4 className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Recent Procurement Activity
          </h4>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-left text-sm min-w-[450px] md:min-w-0">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase whitespace-nowrap">
                    Order Ref
                  </th>
                  <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">
                    Date
                  </th>
                  <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vendor.purchaseOrders && vendor.purchaseOrders.length > 0 ? (
                  vendor.purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {po.poNumber}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter ${
                          po.status === 'FULFILLED' 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500 font-medium">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white text-xs">
                        ₦{po.totalAmount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="w-8 h-8 text-slate-100 dark:text-slate-800" />
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
                          No transaction history
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between gap-3">
        {isDeleted ? (
          <button
            disabled
            className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
          >
            <AlertOctagon className="w-4 h-4" /> Record Inactive (Archived)
          </button>
        ) : (
          <>
            <div className="flex-1">
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                className="w-full h-full py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all border border-transparent hover:border-red-200 flex items-center justify-center gap-2"
              >
                {isArchiving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Archive className="w-4 h-4" />
                    Archive
                  </>
                )}
              </button>
            </div>

            <button
              onClick={onEdit}
              className="flex-[2] py-3 bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-500 text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Modify Entry
            </button>
          </>
        )}
      </div>
    </div>
  );
}