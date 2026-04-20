"use client";

import React, { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package,
  Loader2, CheckCircle2, AlertOctagon,
  Phone, Mail, XCircle, User, Calendar, Hash, ShieldCheck
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types - Precisely Aligned with Backend Prisma Include
------------------------- */
interface GoodsReceiptItem {
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

interface GoodsReceiptNote {
  id: string;
  grnNumber: string;
  organizationId: string;
  branchId: string;
  status: "PENDING" | "RECEIVED" | "REJECTED";
  receivedAt: string | Date;
  notes?: string | null;
  vendor?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  receivedBy?: {
    name: string | null;
  };
  approvedBy?: {
    name: string | null;
  };
  items: GoodsReceiptItem[];
  purchaseOrder?: {
    poNumber: string;
    currency: string;
  } | null;
}

interface GRNDetailViewProps {
  grn: GoodsReceiptNote;
  onClose: () => void;
}

export default function GRNDetailView({ grn, onClose }: GRNDetailViewProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  
  // Production Sync: Local status state ensures UI snappiness after updates
  const [currentStatus, setCurrentStatus] = useState<"PENDING" | "RECEIVED" | "REJECTED">(grn.status);
  const [isProcessing, setIsProcessing] = useState<"APPROVE" | "REJECT" | null>(null);

  const isPending = currentStatus === "PENDING";
  const isApproved = currentStatus === "RECEIVED";
  const isRejected = currentStatus === "REJECTED";
  
  const currencySymbol = useMemo(() => {
    const code = grn.purchaseOrder?.currency || "NGN";
    return code === "NGN" ? "₦" : `${code} `;
  }, [grn.purchaseOrder]);

  const totalValue = useMemo(() => {
    return grn.items.reduce((sum, item) => {
      const cost = typeof item.unitCost === "string" ? parseFloat(item.unitCost) : item.unitCost;
      return sum + (item.quantityAccepted * (cost || 0));
    }, 0);
  }, [grn.items]);

  async function handleAction(action: "APPROVE" | "REJECT") {
    const actionLabel = action === "APPROVE" ? "approve" : "reject";
    const targetStatus = action === "APPROVE" ? "RECEIVED" : "REJECTED";

    const confirmMessage = action === "APPROVE" 
      ? `Finalize GRN ${grn.grnNumber}? This will increment physical stock levels and update the Purchase Order status.` 
      : `Reject GRN ${grn.grnNumber}? This record will be voided and no stock movements will be recorded.`;

    if (!window.confirm(confirmMessage)) return;
    
    setIsProcessing(action);

    try {
      const res = await fetch(`/api/inventory/grns/${grn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.error || `Failed to ${actionLabel} the record.`);
      }

      // Success logic: update local state before firing global events
      setCurrentStatus(targetStatus);

      dispatch?.({ 
        kind: "PUSH", 
        type: action === "APPROVE" ? "SUCCESS" : "WARNING", 
        title: `GRN ${action === "APPROVE" ? "Processed" : "Rejected"}`, 
        message: `Successfully updated ${grn.grnNumber} to ${targetStatus.toLowerCase()}.` 
      });

      window.dispatchEvent(new CustomEvent("grn:updated", { 
        detail: { id: grn.id, status: targetStatus } 
      }));
      
    } catch (err: any) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Action Failed", 
        message: err.message || "An unexpected error occurred during processing." 
      });
    } finally {
      setIsProcessing(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden" role="dialog" aria-labelledby="grn-header">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id="grn-header" className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {grn.grnNumber}
            </h2>
            {isPending && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase">
                Awaiting Approval
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Reference: {grn.purchaseOrder?.poNumber || "Direct Inventory Receipt"}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button 
            onClick={toggleFullScreen} 
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title={isFullScreen ? "Minimize" : "Maximize"}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6">
          
          {/* Information Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <Package className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Vendor Details</span>
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {grn.vendor?.name || "Unspecified Vendor"}
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <Mail className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{grn.vendor?.email || "No contact email"}</span>
                </div>
                {grn.vendor?.phone && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    <span>{grn.vendor.phone}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Audit & Chain</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">Received On</span>
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                    {new Date(grn.receivedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">Recorded By</span>
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate pl-4">
                    {grn.receivedBy?.name || "System Account"}
                  </span>
                </div>
                {!isPending && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                    <span className="text-[10px] text-slate-500">Approved By</span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 truncate pl-4">
                      {grn.approvedBy?.name || "Manager"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receipt Manifest</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase">Product Description</th>
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
                        <span className="text-[9px] text-slate-400 font-mono tracking-tighter">{item.product?.sku}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{item.quantityAccepted}</span>
                        <span className="ml-1 text-[9px] text-slate-400 uppercase">{item.product?.uom?.abbreviation || "UoM"}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={item.quantityRejected > 0 ? "text-red-500 font-bold" : "text-slate-400"}>
                          {item.quantityRejected}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        {currencySymbol}{(item.quantityAccepted * Number(item.unitCost)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Total Receipt Value</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 dark:text-white">
                      {currencySymbol}{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          {grn.notes && (
            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Inspector Remarks</span>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                &ldquo;{grn.notes}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between gap-3">
        {isRejected ? (
          <div className="w-full py-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/20">
            <AlertOctagon className="w-4 h-4" /> Receipt Rejected & Voided
          </div>
        ) : isApproved ? (
          <div className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-900/20">
            <ShieldCheck className="w-4 h-4" /> Transaction Finalized & Stock Updated
          </div>
        ) : (
          <>
            <button 
              onClick={() => handleAction("REJECT")} 
              disabled={isProcessing !== null} 
              className="flex-1 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing === "REJECT" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Reject
            </button>
            <button 
              onClick={() => handleAction("APPROVE")} 
              disabled={isProcessing !== null} 
              className="flex-[2] py-2.5 bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing === "APPROVE" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve & Restock
            </button>
          </>
        )}
      </div>
    </div>
  );
}