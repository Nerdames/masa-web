"use client";

import React, { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package,
  Loader2, CheckCircle2, AlertOctagon,
  Phone, Mail, XCircle, User, Calendar, Hash
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types - Aligned with Prisma
------------------------- */
interface GRNItem {
  id: string;
  productId: string;
  quantityAccepted: number;
  quantityRejected: number;
  unitCost: number | string;
  product?: {
    name: string;
    sku: string;
    uom?: {
      abbreviation: string;
      name: string;
    }
  };
}

interface GRN {
  id: string;
  grnNumber: string;
  organizationId: string;
  branchId: string;
  status: "PENDING" | "RECEIVED" | "REJECTED";
  receivedAt: string;
  notes?: string;
  vendor?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
  };
  receivedBy?: {
    name: string | null;
  };
  approvedBy?: {
    name: string | null;
  };
  items: GRNItem[];
  purchaseOrder?: {
    poNumber: string;
    currency: string;
  }
}

interface GRNDetailViewProps {
  grn: GRN;
  onClose: () => void;
}

export default function GRNDetailView({ grn, onClose }: GRNDetailViewProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  
  const [isProcessing, setIsProcessing] = useState<"APPROVE" | "REJECT" | null>(null);

  const isPending = grn.status === "PENDING";
  const isApproved = grn.status === "RECEIVED";
  const isRejected = grn.status === "REJECTED";
  
  const currencySymbol = grn.purchaseOrder?.currency === "NGN" ? "₦" : (grn.purchaseOrder?.currency ? grn.purchaseOrder.currency + " " : "₦");

  const totalValue = useMemo(() => {
    return grn.items.reduce((sum, item) => sum + (item.quantityAccepted * Number(item.unitCost)), 0);
  }, [grn.items]);

  async function handleAction(action: "APPROVE" | "REJECT") {
    const confirm = window.confirm(
      action === "APPROVE" 
        ? `Approve GRN ${grn.grnNumber}? Inventory stock will be updated.` 
        : `Reject GRN ${grn.grnNumber}? This will mark the receipt as rejected.`
    );
    if (!confirm) return;
    
    setIsProcessing(action);
    const newStatus = action === "APPROVE" ? "RECEIVED" : "REJECTED";

    try {
      const res = await fetch(`/api/inventory/grns/${grn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to ${action.toLowerCase()} GRN`);

      dispatch?.({ 
        kind: "PUSH", 
        type: action === "APPROVE" ? "SUCCESS" : "WARNING", 
        title: `GRN ${action === "APPROVE" ? "Approved" : "Rejected"}`, 
        message: `Successfully processed ${grn.grnNumber}` 
      });
      window.dispatchEvent(new CustomEvent("grn:updated", { detail: { id: grn.id, action: newStatus } }));
      onClose();
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Action failed", message: err.message });
    } finally {
      setIsProcessing(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
      {/* Header - Fixed Height */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {grn.grnNumber}
            </h2>
            {isPending && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase">
                Pending
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Ref: {grn.purchaseOrder?.poNumber || "Direct Receipt"}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button onClick={toggleFullScreen} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content - No horizontal scroll on parent */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6">
          
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor Card */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <Package className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Vendor Information</span>
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{grn.vendor?.name}</p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <Mail className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{grn.vendor?.email || "No email"}</span>
                </div>
                {grn.vendor?.phone && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    <span>{grn.vendor?.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Audit Card */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <Hash className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Receipt Context</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">Received At</span>
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                    {new Date(grn.receivedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">Receiver</span>
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate pl-4">
                    {grn.receivedBy?.name || "System"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Table Container - This is the ONLY part allowed to scroll horizontally */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itemized Breakdown</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase">Product</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">Accepted</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">Rejected</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {grn.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">{item.product?.name}</p>
                        <span className="text-[9px] text-slate-400 font-mono">{item.product?.sku}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{item.quantityAccepted}</span>
                        <span className="ml-1 text-[9px] text-slate-400 uppercase">{item.product?.uom?.abbreviation}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={item.quantityRejected > 0 ? "text-red-500 font-bold" : "text-slate-400"}>
                          {item.quantityRejected}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        {currencySymbol}{(item.quantityAccepted * Number(item.unitCost)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Total Value</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 dark:text-white">
                      {currencySymbol}{totalValue.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes Section */}
          {grn.notes && (
            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Receipt Notes</span>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">"{grn.notes}"</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer - Fixed height */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between gap-3">
        {isRejected ? (
          <div className="w-full py-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/20">
            <AlertOctagon className="w-4 h-4" /> Entry Rejected
          </div>
        ) : isApproved ? (
          <div className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-900/20">
            <CheckCircle2 className="w-4 h-4" /> Received & Stocked
          </div>
        ) : (
          <>
            <button 
              onClick={() => handleAction("REJECT")} 
              disabled={isProcessing !== null} 
              className="flex-1 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {isProcessing === "REJECT" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Reject
            </button>
            <button 
              onClick={() => handleAction("APPROVE")} 
              disabled={isProcessing !== null} 
              className="flex-[2] py-2.5 bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {isProcessing === "APPROVE" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve Receipt
            </button>
          </>
        )}
      </div>
    </div>
  );
}