"use client";

import { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Loader2, CheckCircle2,
  Archive, XCircle, MapPin, 
  ArrowRightLeft, User, Calendar, Activity, ShieldCheck,
  History, PackageSearch
} from "lucide-react";
import { StockTransferStatus, Resource } from "@prisma/client";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { usePermission } from "@/shared/hooks/usePermission";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES                                                         */
/* -------------------------------------------------------------------------- */

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
  currentUserBranchId: string;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Synchronized with RegisterProductPanel)               */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-700 rounded-md text-xs p-2
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white
  focus:ring-1 focus:ring-indigo-500 outline-none transition-all
  placeholder:text-slate-400 disabled:opacity-50 disabled:bg-slate-50
`;

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export function TransferDetailView({ transfer, onClose, currentUserBranchId }: TransferDetailViewProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const { canApprove, canVoid } = usePermission();

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionNotes, setActionNotes] = useState("");

  // Role & Permission Logic
  const isOrigin = currentUserBranchId === transfer.fromBranchId;
  const isDestination = currentUserBranchId === transfer.toBranchId;

  const permissions = useMemo(() => ({
    canHandleApproval: canApprove(Resource.STOCK),
    canHandleVoid: canVoid(Resource.STOCK),
  }), [canApprove, canVoid]);

  const meta = useMemo(() => {
    const s = transfer.status;
    const isPending = s === "PENDING";
    const isApproved = s === "APPROVED";
    const isFinalized = ["COMPLETED", "CANCELLED", "REJECTED"].includes(s);

    return {
      isPending,
      isApproved,
      isFinalized,
      canOriginAction: isOrigin && isPending && (permissions.canHandleApproval || permissions.canHandleVoid),
      canDestinationReceive: isDestination && isApproved && permissions.canHandleApproval,
      statusColor: s === "COMPLETED" ? "text-emerald-500" : isFinalized ? "text-red-500" : "text-indigo-500",
      statusBg: s === "COMPLETED" ? "bg-emerald-50 dark:bg-emerald-500/10" : isFinalized ? "bg-red-50 dark:bg-red-500/10" : "bg-indigo-50 dark:bg-indigo-500/10"
    };
  }, [transfer.status, isOrigin, isDestination, permissions]);

  async function handleAction(action: "APPROVE" | "COMPLETE" | "REJECT" | "CANCEL") {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/inventory/transfers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId: transfer.id, action, notes: actionNotes }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      dispatch?.({ 
        kind: "PUSH", 
        type: "SUCCESS", 
        title: "Transfer Updated", 
        message: `Stock transfer has been ${action.toLowerCase()}ed.` 
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
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tighter">
              {transfer.transferNumber}
            </h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase">
              {isOrigin ? "Outbound Dispatch" : "Inbound Receipt"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <form id="transfer-form" className="p-5 space-y-8">
          
          {/* SECTION 1: Logistics Path */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logistics Chain</h3>
            </div>
            <div className={`grid gap-6 ${isFullScreen ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label className={labelClass}>Source Branch</label>
                <div className={inputClass}>{transfer.fromBranch?.name}</div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Destination Branch</label>
                <div className={inputClass}>{transfer.toBranch?.name}</div>
              </div>
            </div>
          </section>

          {/* SECTION 2: Transfer Context */}
          <section className="bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
            <div className={`grid gap-6 ${isFullScreen ? "grid-cols-3" : "grid-cols-1"}`}>
              <div className="space-y-1">
                <label className={labelClass}>Current Status</label>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950`}>
                  <Activity className={`w-3 h-3 ${meta.statusColor}`} />
                  <span className={`text-[10px] font-black uppercase ${meta.statusColor}`}>{transfer.status}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Authorized By</label>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 px-1 py-2">
                  <User className="w-3 h-3" />
                  <span>{transfer.createdBy?.name || "System"}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Initiated Date</label>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 px-1 py-2">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(transfer.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: Item Manifest */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <PackageSearch className="w-3.5 h-3.5 text-slate-400" />
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Manifest</h3>
              </div>
              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {transfer.items.length} Items
              </span>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-tighter">Product SKU & Name</th>
                    <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-tighter text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transfer.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="block font-black text-slate-800 dark:text-slate-200 uppercase">{item.product?.name}</span>
                        <span className="text-[9px] font-mono text-slate-400">{item.product?.sku}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{item.quantity}</span>
                        <span className="ml-1 text-[9px] text-slate-400 uppercase">{item.product?.uom?.abbreviation}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 4: Annotations */}
          {!meta.isFinalized && (
            <section className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <label className={labelClass + " mb-0"}>Audit Log Annotation</label>
              </div>
              <textarea 
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Briefly state the reason for this action (Approved, Voided, or Received)..."
                className={`${inputClass} h-24 resize-none`}
              />
            </section>
          )}
        </form>
      </div>

      {/* FOOTER */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-3 shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          disabled={isProcessing} 
          className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors"
        >
          Discard
        </button>

        {meta.isFinalized ? (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-md ${meta.statusBg} ${meta.statusColor} border border-current/10 text-[9px] font-black uppercase tracking-widest`}>
            {transfer.status === "COMPLETED" ? <Archive className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {transfer.status === "COMPLETED" ? "Transfer Finalized" : "Transfer Closed"}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* VOID / REJECT BUTTON */}
            {((isOrigin && meta.isPending) || (isDestination && meta.isApproved)) && (
              <button
                type="button"
                onClick={() => handleAction(isOrigin ? "CANCEL" : "REJECT")}
                disabled={isProcessing}
                className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 text-[9px] font-bold uppercase tracking-widest rounded-md transition-all border border-red-200 dark:border-red-900/50"
              >
                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : isOrigin ? "Void Transfer" : "Reject Shipment"}
              </button>
            )}

            {/* PRIMARY ACTION BUTTON */}
            {(meta.canOriginAction || meta.canDestinationReceive) && (
              <button
                type="button"
                onClick={() => handleAction(isOrigin ? "APPROVE" : "COMPLETE")}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-6 py-2 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-md hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isOrigin ? (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    Approve Dispatch
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Confirm Receipt
                  </>
                )}
              </button>
            )}

            {/* IN-TRANSIT PLACEHOLDER */}
            {isOrigin && meta.isApproved && (
              <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-500 text-[9px] font-bold uppercase tracking-widest rounded-md">
                <Activity className="w-3 h-3 animate-pulse" />
                In Transit
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}