"use client";

import React, { useState } from "react";
import {
  X, Maximize2, Minimize2, Loader2,
  CheckCircle2, XCircle, MapPin, ShieldCheck, 
  Truck, Activity, FileText, ClipboardList,
  User} from "lucide-react";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { usePermission } from "@/shared/hooks/usePermission";
import { PermissionAction, Resource, StockTransferStatus } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES                                                         */
/* -------------------------------------------------------------------------- */

interface ITransferItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    name: string;
    sku: string;
    uom?: { abbreviation: string };
  };
}

interface ITransferRecord {
  id: string;
  transferNumber: string;
  organizationId: string;
  fromBranchId: string;
  toBranchId: string;
  status: StockTransferStatus;
  createdAt: Date | string;
  notes?: string | null;
  fromBranch?: { name: string };
  toBranch?: { name: string };
  createdBy?: { name: string | null };
  approvedBy?: { name: string | null };
  items: ITransferItem[];
}

interface TransferApprovalPanelProps {
  transfer: ITransferRecord;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES                                                         */
/* -------------------------------------------------------------------------- */

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";
const sectionClass = "space-y-4 py-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0";
const infoBoxClass = "p-3 rounded-md bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 flex flex-col gap-1";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export function TransferApprovalPanel({ transfer, onClose }: TransferApprovalPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can, user } = usePermission();

  // State Management
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Identity & Permissions Alignment
  const userBranchId = user?.branchId;
  const isFromBranch = userBranchId === transfer.fromBranchId;
  const isToBranch = userBranchId === transfer.toBranchId;
  
  // Aligning with Backend: APPROVE uses PermissionAction.APPROVE, others use UPDATE
  const canApprove = can(PermissionAction.APPROVE, Resource.STOCK);
  const canUpdate = can(PermissionAction.UPDATE, Resource.STOCK);
  
  const isPending = transfer.status === StockTransferStatus.PENDING;
  const isApproved = transfer.status === StockTransferStatus.APPROVED;
  const isFinalized = [
    StockTransferStatus.COMPLETED, 
    StockTransferStatus.CANCELLED, 
    StockTransferStatus.REJECTED
  ].includes(transfer.status);

  /**
   * Executes the state transition protocol.
   * Synchronized with UpdateTransferSchema in the API.
   */
  async function executeProtocol(action: "APPROVE" | "COMPLETE" | "REJECT" | "CANCEL") {
    const confirmationMessages = {
      APPROVE: "Authorize stock dispatch? Inventory will be committed for exit.",
      COMPLETE: "Confirm receipt? Inventory will be added to destination branch.",
      REJECT: "Deny this transfer request? Action will be logged.",
      CANCEL: "Abort this transfer protocol? Origin stock will be restored if applicable."
    };

    if (!window.confirm(confirmationMessages[action])) return;

    setIsProcessing(action);

    try {
      // Corrected endpoint to match src/app/api/transfers/route.ts
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transferId: transfer.id, 
          action,
          notes: `Protocol executed via dashboard by ${user?.name || 'Authorized Personnel'}`
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Logistics protocol failure.");

      dispatch?.({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Protocol Executed", 
        message: `TRF ${transfer.transferNumber} moved to ${action} status.` 
      });

      // Global refresh event for the data table
      window.dispatchEvent(new CustomEvent("transfer:refresh"));
      onClose();
    } catch (err: any) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Authorization/Logic Fault", 
        message: err.message 
      });
    } finally {
      setIsProcessing(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl" role="dialog">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate uppercase tracking-tight">
              Protocol: {transfer.transferNumber}
            </h2>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="text-[9px] text-slate-500 font-medium uppercase mt-0.5 tracking-widest">Stock Movement Authorization</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={toggleFullScreen} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-transparent">
        <div className="p-4 space-y-0">
          
          {/* Section 1: Logistics Path */}
          <section className={sectionClass}>
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <MapPin className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Routing Manifest</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={infoBoxClass}>
                <label className={labelClass}>Origin Source</label>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">{transfer.fromBranch?.name}</span>
              </div>
              <div className={infoBoxClass}>
                <label className={labelClass}>Target Destination</label>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">{transfer.toBranch?.name}</span>
              </div>
            </div>
          </section>

          {/* Section 2: Audit Trail */}
          <section className={sectionClass}>
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <Activity className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Identity & Verification</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Initiated By</label>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <User className="w-3 h-3" /> {transfer.createdBy?.name || "System"}
                </div>
              </div>
              <div>
                <label className={labelClass}>Timestamp</label>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {new Date(transfer.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              {transfer.approvedBy && (
                <div>
                  <label className={labelClass}>Authorized By</label>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    {transfer.approvedBy.name}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Asset Details */}
          <section className={sectionClass}>
            <div className="flex items-center gap-2 text-slate-400 mb-3">
              <ClipboardList className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Inventory Manifest</span>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 uppercase whitespace-nowrap">SKU / Product</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 uppercase text-right whitespace-nowrap">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {transfer.items.map((item) => (
                    <tr key={item.id} className="text-xs">
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-slate-800 dark:text-slate-200 uppercase leading-none">{item.product.name}</p>
                        <p className="text-[9px] text-slate-400 font-mono mt-1">{item.product.sku}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-bold text-slate-900 dark:text-white mr-1">{item.quantity}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{item.product.uom?.abbreviation || "UNT"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4: Notes */}
          {transfer.notes && (
            <section className={sectionClass}>
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <FileText className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Logistics Remarks</span>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-600 dark:text-slate-400 italic leading-relaxed">
                &ldquo;{transfer.notes}&rdquo;
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Footer Actions - Optimized for Non-Wrap and Anti-Distortion */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-nowrap items-center justify-end gap-3 shrink-0 overflow-x-auto no-scrollbar">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={isProcessing !== null}
          className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors whitespace-nowrap flex-shrink-0"
        >
          Close Panel
        </button>

        {isFinalized ? (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-widest rounded border border-emerald-100 dark:border-emerald-500/20 whitespace-nowrap flex-shrink-0">
            <ShieldCheck className="w-3 h-3" /> Record Finalized
          </div>
        ) : (
          <div className="flex flex-nowrap items-center gap-2 flex-shrink-0">
            {/* Origin Rejection/Cancel */}
            {isPending && (isFromBranch || canUpdate) && (
              <button
                onClick={() => executeProtocol("REJECT")}
                disabled={isProcessing !== null}
                className="px-4 py-2 bg-white dark:bg-slate-950 border border-red-200 dark:border-red-900/50 text-red-600 text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-red-50 transition-all shadow-sm flex items-center gap-2 whitespace-nowrap"
              >
                {isProcessing === "REJECT" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Reject
              </button>
            )}

            {/* Origin Approval */}
            {isPending && (isFromBranch || canApprove) && (
              <button
                onClick={() => executeProtocol("APPROVE")}
                disabled={isProcessing !== null}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-indigo-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 whitespace-nowrap"
              >
                {isProcessing === "APPROVE" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                Authorize
              </button>
            )}

            {/* Destination Completion */}
            {isApproved && (isToBranch || canUpdate) && (
              <button
                onClick={() => executeProtocol("COMPLETE")}
                disabled={isProcessing !== null}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 whitespace-nowrap"
              >
                {isProcessing === "COMPLETE" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Confirm Intake
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SUB-COMPONENTS                                                             */
/* -------------------------------------------------------------------------- */

function StatusBadge({ status }: { status: StockTransferStatus }) {
  const config: Record<StockTransferStatus, string> = {
    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/50",
    APPROVED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200/50",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/50",
    CANCELLED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200/50",
    COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50",
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold tracking-widest border uppercase whitespace-nowrap ${config[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}