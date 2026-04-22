"use client";

import { useState } from "react";
import {
  X, Maximize2, Minimize2, 
  Activity, CreditCard, CheckCircle2,
  Loader2, Receipt, Banknote,
  ShieldCheck, XCircle, Info
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* -------------------------
Types & Interfaces
------------------------- */
export enum ApprovalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED"
}

export interface IFinancialAccount {
  id: string;
  name: string;
  balance: number | string;
}

export interface IRefund {
  id: string;
  refundNumber: string;
  totalRefunded: number;
  status: ApprovalStatus;
  reason?: string;
  createdAt: string | Date;
  invoice?: {
    invoiceNumber: string;
    customer?: { name: string };
  };
  processedBy?: { name: string };
  approvedBy?: { name: string };
  items: Array<{
    quantity: number;
    refundAmount: number;
    restocked: boolean;
    branchProduct?: {
      product?: {
        name: string;
        sku: string;
        uom?: { abbreviation: string };
      };
    };
  }>;
}

interface Props {
  refund: IRefund;
  accounts: IFinancialAccount[];
  canProcess: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

/* -------------------------
Refund Detail Panel Component
------------------------- */
export function RefundDetailView({ refund, accounts, canProcess, onClose, onRefresh }: Props) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();

  // State Management
  const [isProcessing, setIsProcessing] = useState(false);
  const [approvalModal, setApprovalModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const handleProcess = async (status: ApprovalStatus) => {
    if (status === ApprovalStatus.APPROVED && !selectedAccountId && refund.totalRefunded > 0) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Validation Error", message: "Select a funding account." });
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refundId: refund.id,
          status,
          notes,
          financialAccountId: status === ApprovalStatus.APPROVED ? selectedAccountId : undefined
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to process refund");

      dispatch({ 
        kind: "PUSH", 
        type: "SUCCESS", 
        title: "Protocol Updated", 
        message: `Refund ${refund.refundNumber} was ${status.toLowerCase()}.` 
      });
      
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Process Failed", 
        message: err?.message || "Operation failed." 
      });
    } finally {
      setIsProcessing(false);
      setApprovalModal(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden relative">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate font-mono">
              {refund.refundNumber}
            </h2>
            <StatusBadge status={refund.status} />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-tight">
            Inventory Return & Refund Protocol
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Receipt className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Source Reference</span>
            </div>
            <div className="space-y-1">
              <p className="text-[8px] font-bold text-slate-400 uppercase">Target Invoice</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
                {refund.invoice?.invoiceNumber || "N/A"}
              </p>
              <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                {refund.invoice?.customer?.name || "Walk-In Customer"}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Activity className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Audit Trail</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500">Initiated By</span>
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">{refund.processedBy?.name || "System"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500">Created At</span>
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                  {new Date(refund.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
              {refund.approvedBy && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500">Authorized By</span>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{refund.approvedBy.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reason Block */}
        {refund.reason && (
          <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Info className="w-3 h-3 text-slate-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Return Reason / Notes</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
              &ldquo;{refund.reason}&rdquo;
            </p>
          </div>
        )}

        {/* Items Manifest */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Return Line Items</h4>
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs min-w-[450px]">
              <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase">Product Details</th>
                  <th className="px-3 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">Restocked</th>
                  <th className="px-3 py-3 text-[9px] font-bold text-slate-500 uppercase text-center">Qty</th>
                  <th className="px-4 py-3 text-[9px] font-bold text-slate-500 uppercase text-right">Refund Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {refund.items.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 uppercase">
                        {item.branchProduct?.product?.name || "Unknown Product"}
                      </p>
                      <span className="text-[9px] text-slate-400 font-mono tracking-tighter">
                        {item.branchProduct?.product?.sku}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {item.restocked ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full uppercase">
                          Yes
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-400 uppercase">No</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-slate-900 dark:text-white font-bold">
                        {item.quantity} {item.branchProduct?.product?.uom?.abbreviation || 'unit'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        ₦{Number(item.refundAmount).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase text-right tracking-widest">
                    Total Liquidation Value
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      ₦{Number(refund.totalRefunded).toLocaleString()}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      {refund.status === ApprovalStatus.PENDING && canProcess && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3 z-20">
          <button 
            onClick={() => handleProcess(ApprovalStatus.REJECTED)} 
            disabled={isProcessing} 
            className="flex-1 max-w-[160px] py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex justify-center items-center gap-2 border border-transparent hover:border-red-200 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject Request
          </button>
          
          <button 
            onClick={() => setApprovalModal(true)} 
            disabled={isProcessing} 
            className="flex-[2] py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex justify-center items-center gap-2 disabled:opacity-50"
          >
            <Banknote className="w-4 h-4" />
            Approve & Payout
          </button>
        </div>
      )}

      {/* Finalized View */}
      {refund.status !== ApprovalStatus.PENDING && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex">
          <div className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-900/20">
            <ShieldCheck className="w-4 h-4" /> Protocol {refund.status.toLowerCase()}
          </div>
        </div>
      )}

      {/* Funding Modal */}
      {approvalModal && (
        <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-4">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
               <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-500" /> Funding Source
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase mt-0.5 tracking-tight">
                    Authorize payout of ₦{Number(refund.totalRefunded).toLocaleString()}
                  </p>
               </div>
               <button onClick={() => setApprovalModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                 <X className="w-4 h-4" />
               </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Funding Account</label>
                <select 
                  value={selectedAccountId} 
                  onChange={(e) => setSelectedAccountId(e.target.value)} 
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl text-sm p-3 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors"
                >
                  <option value="">-- Select Source --</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (₦{Number(acc.balance).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Approval Notes</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  placeholder="Internal audit notes..."
                  rows={2} 
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl text-sm p-3 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-2">
              <button onClick={() => setApprovalModal(false)} className="px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button 
                onClick={() => handleProcess(ApprovalStatus.APPROVED)} 
                disabled={isProcessing || (!selectedAccountId && refund.totalRefunded > 0)} 
                className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} 
                Confirm Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------
Sub-Components
------------------------- */

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const config: Record<ApprovalStatus, string> = {
    [ApprovalStatus.PENDING]: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200/50",
    [ApprovalStatus.APPROVED]: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50",
    [ApprovalStatus.REJECTED]: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/50",
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-wider border uppercase whitespace-nowrap ${config[status]}`}>
      {status}
    </span>
  );
}