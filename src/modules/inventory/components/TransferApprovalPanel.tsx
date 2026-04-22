"use client";

import React, { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package,
  Loader2, CheckCircle2, AlertOctagon,
  XCircle, MapPin, ShieldCheck, 
  Truck, Barcode, User, Activity,
  Calendar, Hash, ArrowRightLeft
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSession } from "next-auth/react";

/* -------------------------
Types - Synced with MASA Prisma Schema
------------------------- */
type StockTransferStatus = "PENDING" | "APPROVED" | "IN_TRANSIT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED" | "REJECTED" | "COMPLETED";

interface TransferItem {
  id: string;
  productId: string;
  quantity: number;
  quantityReceived: number;
  product?: {
    name: string;
    sku: string;
    uom?: { abbreviation: string }
  };
}

interface TransferRecord {
  id: string;
  transferNumber: string;
  organizationId: string;
  fromBranchId: string;
  toBranchId: string;
  status: StockTransferStatus;
  createdAt: string | Date;
  notes?: string | null;
  fromBranch?: { name: string };
  toBranch?: { name: string };
  createdBy?: { name: string | null };
  approvedBy?: { name: string | null };
  items: TransferItem[];
}

interface Props {
  transfer: TransferRecord;
  onClose: () => void;
}

export function TransferApprovalPanel({ transfer, onClose }: Props) {
  const { data: session } = useSession();
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();

  // State Management
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Identity & Permissions
  const userBranchId = session?.user?.branchId;
  const isFromBranch = userBranchId === transfer.fromBranchId;
  const isToBranch = userBranchId === transfer.toBranchId;
  const isAdmin = ["ADMIN", "MANAGER"].includes(session?.user?.role || "");
  const canPerformActions = isAdmin || isFromBranch || isToBranch;

  // Status Logic
  const isPending = transfer.status === "PENDING";
  const isApproved = transfer.status === "APPROVED";
  const isFinalized = ["RECEIVED", "COMPLETED", "CANCELLED", "REJECTED"].includes(transfer.status);

  async function executeProtocol(action: "APPROVE" | "COMPLETE" | "REJECT" | "CANCEL") {
    const messages = {
      APPROVE: "Authorize stock exit? Inventory will be deducted from the origin branch.",
      COMPLETE: "Commit stock intake? Inventory will be added to the destination branch.",
      REJECT: "Deny this transfer request? No stock will be moved.",
      CANCEL: "Abort this transfer? Any reserved stock will be rolled back."
    };

    if (!window.confirm(messages[action])) return;

    setIsProcessing(action);

    try {
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transferId: transfer.id, 
          action,
          notes: `Protocol ${action} executed by ${session?.user?.name}` 
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Protocol execution failed");

      dispatch?.({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Protocol Success", 
        message: `Transfer ${transfer.transferNumber} updated to ${action}.` 
      });

      window.dispatchEvent(new CustomEvent("transfer:updated", { detail: { id: transfer.id } }));
      onClose();
    } catch (err: any) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Protocol Fault", 
        message: err.message 
      });
    } finally {
      setIsProcessing(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden" role="dialog">
      
      {/* Header - Refined Style */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {transfer.transferNumber}
            </h2>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-tight">
            Stock Transfer Protocol
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

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-6">

          {/* Logistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Route Details</span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">From Origin</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate uppercase">{transfer.fromBranch?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                   <ArrowRightLeft className="w-3 h-3 text-indigo-500" />
                   <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase">To Destination</p>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate uppercase">{transfer.toBranch?.name}</p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <Activity className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Audit Trail</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">Initiated By</span>
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">{transfer.createdBy?.name || "System"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">Date Created</span>
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                    {new Date(transfer.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </span>
                </div>
                {transfer.approvedBy && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                    <span className="text-[10px] text-slate-500">Authorized By</span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      {transfer.approvedBy?.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table - GRN Style */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asset Manifest</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-xs min-w-[400px]">
                <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase">Product Details</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">Transfer Qty</th>
                    <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase text-right">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {transfer.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 uppercase">{item.product?.name}</p>
                        <span className="text-[9px] text-slate-400 font-mono tracking-tighter">{item.product?.sku}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-slate-900 dark:text-white font-bold text-sm">{item.quantity}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {item.product?.uom?.abbreviation || "UNT"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          {transfer.notes && (
            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Logistics Notes</span>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                &ldquo;{transfer.notes}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions - Matching GRN layout */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between gap-3">
        {isFinalized ? (
          <div className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-900/20">
            <ShieldCheck className="w-4 h-4" /> Protocol Finalized
          </div>
        ) : (
          canPerformActions && (
            <>
              {/* Termination / Rejection */}
              {(isPending || isApproved) && (isAdmin || isFromBranch) && (
                <button
                  onClick={() => executeProtocol(isPending ? "REJECT" : "CANCEL")}
                  disabled={isProcessing !== null}
                  className="flex-1 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isProcessing === "CANCEL" || isProcessing === "REJECT" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  {isPending ? "Reject" : "Cancel"}
                </button>
              )}

              {/* Approval Action */}
              {isPending && (isFromBranch || isAdmin) && (
                <button
                  onClick={() => executeProtocol("APPROVE")}
                  disabled={isProcessing !== null}
                  className="flex-[2] py-2.5 bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-500 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isProcessing === "APPROVE" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  Authorize Dispatch
                </button>
              )}

              {/* Completion Action */}
              {isApproved && (isToBranch || isAdmin) && (
                <button
                  onClick={() => executeProtocol("COMPLETE")}
                  disabled={isProcessing !== null}
                  className="flex-[2] py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isProcessing === "COMPLETE" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Intake
                </button>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}

/* -------------------------
Sub-Components
------------------------- */

function StatusBadge({ status }: { status: StockTransferStatus }) {
  const config: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/50",
    APPROVED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200/50",
    IN_TRANSIT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200/50",
    COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50",
    RECEIVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/50",
    REJECTED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200/50",
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider border uppercase whitespace-nowrap ${config[status] || config.REJECTED}`}>
      {status.replace("_", " ")}
    </span>
  );
}