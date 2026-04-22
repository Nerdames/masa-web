"use client";

import React, { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Loader2, CheckCircle2, 
  Archive, XCircle, MapPin, ChevronDown, 
  ArrowRightLeft, User, Calendar, Activity, ShieldCheck,
  AlertCircle
} from "lucide-react";
import { StockTransferStatus } from "@prisma/client";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types - Synchronized with MASA API & Schema
------------------------- */
interface TransferItem {
  id: string;
  productId: string;
  quantity: number;
  product?: {
    name: string;
    sku: string;
    uom?: { abbreviation: string; }
  };
}

interface Transfer {
  id: string;
  transferNumber: string;
  status: StockTransferStatus;
  fromBranchId: string;
  toBranchId: string;
  fromBranch?: { name: string };
  toBranch?: { name: string };
  createdAt: string;
  notes?: string;
  createdBy?: { name: string | null };
  items: TransferItem[];
}

interface TransferDetailViewProps {
  transfer: Transfer;
  onClose: () => void;
  currentUserBranchId: string; // Critical for intelligent footer logic
}

export function TransferDetailView({ transfer, onClose, currentUserBranchId }: TransferDetailViewProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionNotes, setActionNotes] = useState("");

  // Role Detection
  const isOrigin = currentUserBranchId === transfer.fromBranchId;
  const isDestination = currentUserBranchId === transfer.toBranchId;

  /**
   * Intelligent State Mapping
   * Prevents UI from allowing illegal transitions already blocked by the API
   */
  const meta = useMemo(() => {
    const status = transfer.status;
    const isPending = status === "PENDING";
    const isApproved = status === "APPROVED";
    const isCompleted = status === "COMPLETED";
    const isFinalized = ["COMPLETED", "CANCELLED", "REJECTED"].includes(status);

    return {
      isPending,
      isApproved,
      isCompleted,
      isFinalized,
      // Source can only Void/Approve if Pending
      canOriginAction: isOrigin && isPending,
      // Destination can only Receive if Approved (In Transit)
      canDestinationReceive: isDestination && isApproved,
      // Labels
      statusColor: isCompleted ? "text-emerald-500" : isFinalized ? "text-red-500" : "text-indigo-500"
    };
  }, [transfer.status, isOrigin, isDestination]);

  async function handleAction(action: "APPROVE" | "COMPLETE" | "REJECT" | "CANCEL") {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/inventory/transfers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          transferId: transfer.id, 
          action, 
          notes: actionNotes 
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      dispatch?.({ 
        kind: "PUSH", 
        type: "SUCCESS", 
        title: "Success", 
        message: `Transfer ${action.toLowerCase()}ed successfully.` 
      });
      
      window.dispatchEvent(new CustomEvent("transfer:updated", { detail: { id: transfer.id, action } }));
      onClose();
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "Error", message: err.message });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl relative overflow-hidden">
      {/* HEADER */}
      <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-30">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
            <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="overflow-hidden">
            <h2 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter truncate">
              {transfer.transferNumber}
            </h2>
            <p className="text-[10px] text-slate-500 font-medium truncate uppercase tracking-tight">
              {isOrigin ? "Outbound Transfer" : "Inbound Receipt"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-6">
          
          {/* LOGISTICS PATH */}
          <section className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex flex-col items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full ${isOrigin ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                <div className="w-0.5 h-8 border-l-2 border-dashed border-slate-200 dark:border-slate-800" />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">From (Source)</span>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{transfer.fromBranch?.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className={`w-3 h-3 mt-0.5 ${isDestination ? 'text-indigo-500' : 'text-slate-400'}`} />
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase block">To (Destination)</span>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{transfer.toBranch?.name}</p>
              </div>
            </div>
          </section>

          {/* METADATA */}
          <section className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
              </div>
              <span className={`text-[10px] font-black uppercase ${meta.statusColor}`}>
                {transfer.status}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Originator</span>
              </div>
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                {transfer.createdBy?.name || "System"}
              </span>
            </div>
          </section>

          {/* ITEM MANIFEST */}
          <section className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Manifest</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3 font-bold text-slate-500 uppercase">Product</th>
                    <th className="px-4 py-3 font-bold text-slate-500 uppercase text-center">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {transfer.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800 dark:text-slate-200 uppercase">{item.product?.name}</p>
                        <p className="text-[9px] font-mono text-slate-400 tracking-tighter">{item.product?.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                        {item.quantity} <span className="text-[9px] text-slate-400">{item.product?.uom?.abbreviation}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ACTION NOTES */}
          {!meta.isFinalized && (
            <section className="space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Log Annotation</h4>
              <textarea 
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Entry for forensic audit trail..."
                className="w-full h-20 p-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
              />
            </section>
          )}
        </div>
      </div>

      {/* INTELLIGENT FOOTER */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {meta.isFinalized ? (
          <div className={`w-full py-3 text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-2 border ${
            meta.isCompleted ? 'bg-emerald-50 text-emerald-500 border-emerald-100' : 'bg-red-50 text-red-500 border-red-100'
          }`}>
            {meta.isCompleted ? <Archive className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {meta.isCompleted ? "Transfer Fully Completed" : "Transfer Voided / Rejected"}
          </div>
        ) : (
          <div className="flex gap-3">
            {/* SOURCE BRANCH CONTROLS */}
            {isOrigin && (
              <>
                <button 
                  onClick={() => handleAction("CANCEL")} 
                  disabled={isProcessing || !meta.isPending} 
                  className="flex-1 py-3 text-slate-400 hover:text-red-500 text-[10px] font-bold uppercase rounded-xl border border-slate-200 dark:border-slate-800 transition-all disabled:opacity-30"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Void"}
                </button>
                {meta.isPending && (
                  <button 
                    onClick={() => handleAction("APPROVE")} 
                    disabled={isProcessing}
                    className="flex-[2] py-3 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Approve Dispatch
                  </button>
                )}
                {meta.isApproved && (
                  <div className="flex-[2] py-3 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] font-bold uppercase rounded-xl flex items-center justify-center gap-2">
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    In Transit
                  </div>
                )}
              </>
            )}

            {/* DESTINATION BRANCH CONTROLS */}
            {isDestination && (
              <button 
                onClick={() => handleAction("COMPLETE")} 
                disabled={isProcessing || !meta.isApproved}
                className={`w-full py-3 text-white text-[10px] font-black uppercase rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all ${
                  meta.isApproved 
                  ? "bg-slate-900 dark:bg-indigo-600 active:scale-95" 
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed shadow-none"
                }`}
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : meta.isApproved ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {meta.isApproved ? "Confirm Stock Receipt" : "Awaiting Dispatch"}
                {meta.isApproved && <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}