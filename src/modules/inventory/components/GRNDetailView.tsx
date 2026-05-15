"use client";

import React, { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Package,
  Loader2, CheckCircle2, AlertOctagon,
  Phone, Mail, XCircle, ShieldCheck,
  Calendar, User, Hash, FileText,
  Truck, ClipboardCheck, ArrowRight,
  Database, Fingerprint
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { Resource, PermissionAction, GRNStatus } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

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
  status: GRNStatus;
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

/* -------------------------------------------------------------------------- */
/* STYLES (High-Density Enterprise Specs)                                    */
/* -------------------------------------------------------------------------- */

const labelClass = "text-[8.5px] font-bold text-slate-400 uppercase tracking-[0.15em] block mb-1 whitespace-nowrap";
const valueClass = "text-[10.5px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1.5 rounded border border-slate-200/60 dark:border-slate-700/40 flex items-center gap-2 whitespace-nowrap tabular-nums";
const sectionHeader = "flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-4";
const sectionTitle = "text-[9px] font-black text-slate-800 dark:text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2";

export default function GRNDetailView({ grn, onClose }: GRNDetailViewProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  
  const { can } = usePermission();
  const canFinalize = can(Resource.PROCUREMENT, PermissionAction.APPROVE);
  const canReject = can(Resource.PROCUREMENT, PermissionAction.VOID);

  const [currentStatus, setCurrentStatus] = useState<GRNStatus>(grn.status);
  const [isProcessing, setIsProcessing] = useState<"APPROVE" | "REJECT" | null>(null);

  const isPending = currentStatus === GRNStatus.PENDING;
  const isApproved = currentStatus === GRNStatus.RECEIVED;
  const isRejected = currentStatus === GRNStatus.REJECTED;
  
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
    const targetStatus = action === "APPROVE" ? "RECEIVED" : "REJECTED";
    if (!window.confirm(`Initiate ${action} protocol? This ledger entry is irreversible.`)) return;
    
    setIsProcessing(action);
    try {
      const res = await fetch(`/api/inventory/grns/${grn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Protocol failure: ${action}`);

      setCurrentStatus(targetStatus as GRNStatus);
      dispatch?.({ 
        kind: "PUSH", 
        type: action === "APPROVE" ? "SUCCESS" : "WARNING", 
        title: `Asset ${action === "APPROVE" ? "Reconciled" : "Voided"}`, 
        message: `Fiscal log ${grn.grnNumber} committed to ledger.` 
      });

      window.dispatchEvent(new CustomEvent("grn:updated", { detail: { id: grn.id, status: targetStatus } }));
    } catch (err: any) {
      dispatch?.({ kind: "TOAST", type: "ERROR", title: "System Fault", message: err.message });
    } finally {
      setIsProcessing(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-950 overflow-hidden">
      
      {/* HEADER: Forensic Context */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-950 z-30">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-slate-900 dark:bg-emerald-500/10 rounded text-white dark:text-emerald-500">
            <Fingerprint className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tighter whitespace-nowrap">
              LOG_REF: {grn.grnNumber}
            </h2>
            <div className="flex items-center gap-2">
              <span className={`text-[7px] font-black px-1 py-0.5 rounded uppercase tracking-widest ${
                isApproved ? "bg-emerald-500 text-white" :
                isRejected ? "bg-red-500 text-white" : "bg-amber-500 text-white"
              }`}>
                {currentStatus}
              </span>
              <span className="text-[8px] text-slate-400 font-bold uppercase whitespace-nowrap">PO_RECON: {grn.purchaseOrder?.poNumber || "DIRECT"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={toggleFullScreen} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-all">
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="max-w-full space-y-6">
          
          {/* METADATA GRID: Dynamic Stacking */}
          <div className={`grid gap-4 ${isFullScreen ? "grid-cols-2" : "grid-cols-1"}`}>
            {/* Vendor Origin */}
            <section className="bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800/50">
              <div className={sectionHeader}>
                <h3 className={sectionTitle}><Truck className="w-3 h-3 text-emerald-500" /> Fiscal Origin</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Legal Entity</label>
                  <div className={valueClass}><Package className="w-3 h-3 opacity-50" /> {grn.vendor?.name}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Comms Channel</label>
                    <div className={valueClass}><Mail className="w-3 h-3 opacity-50" /> {grn.vendor?.email || "N/A"}</div>
                  </div>
                  <div>
                    <label className={labelClass}>Direct Line</label>
                    <div className={valueClass}><Phone className="w-3 h-3 opacity-50" /> {grn.vendor?.phone || "N/A"}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Forensic Chain */}
            <section className="bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800/50">
              <div className={sectionHeader}>
                <h3 className={sectionTitle}><ShieldCheck className="w-3 h-3 text-blue-500" /> Forensic Chain</h3>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Timestamp</label>
                    <div className={valueClass}><Calendar className="w-3 h-3 opacity-50" /> {new Date(grn.receivedAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <label className={labelClass}>Node ID</label>
                    <div className={valueClass}><Hash className="w-3 h-3 opacity-50" /> {grn.branchId.slice(-8).toUpperCase()}</div>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Authored By</label>
                  <div className={valueClass}><User className="w-3 h-3 opacity-50" /> {grn.receivedBy?.name || "SYS_AUTO"}</div>
                </div>
              </div>
            </section>
          </div>

          {/* MANIFEST: Reconciliation Table */}
          <section>
            <div className={sectionHeader}>
              <h3 className={sectionTitle}><FileText className="w-3 h-3 text-slate-400" /> Reconciliation Manifest</h3>
              <span className="text-[8px] font-black bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 uppercase">
                Line Items: {grn.items.length}
              </span>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-800 rounded overflow-x-auto shadow-sm">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
                  <tr className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-3 py-2">Inventory Resource</th>
                    <th className="px-3 py-2 text-center">Qty. Committed</th>
                    <th className="px-3 py-2 text-center text-red-400">Qty. Discrepancy</th>
                    <th className="px-3 py-2 text-right">Unit Value</th>
                    <th className="px-3 py-2 text-right">Ext. Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {grn.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 whitespace-nowrap">
                      <td className="px-3 py-2">
                        <div className="text-[10px] font-bold text-slate-800 dark:text-slate-200">{item.product?.name}</div>
                        <div className="text-[7px] font-mono text-slate-400 tracking-tighter uppercase">{item.product?.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {item.quantityAccepted} <span className="text-[7px] opacity-60 uppercase">{item.product?.uom?.abbreviation}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-[10px] font-bold text-red-500 tabular-nums">
                        {item.quantityRejected > 0 ? item.quantityRejected : "0.00"}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] font-medium text-slate-400 tabular-nums">
                        {Number(item.unitCost).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-white tabular-nums text-[10px]">
                        {currencySymbol}{(item.quantityAccepted * Number(item.unitCost)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 dark:bg-black border-t-2 border-slate-800">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-[8px] font-black uppercase text-slate-500">Gross Manifest Valuation</td>
                    <td className="px-3 py-2 text-right text-[11px] font-black text-emerald-400 tabular-nums whitespace-nowrap">
                      {currencySymbol}{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Logistics Protocol Notes */}
          {grn.notes && (
            <section className="border-l-2 border-amber-500 pl-4 py-1">
              <label className={labelClass}>Protocol Remarks</label>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                &ldquo;{grn.notes}&rdquo;
              </div>
            </section>
          )}
        </div>
      </div>

      {/* FOOTER ACTIONS: Contextual Protocol Controls */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end items-center gap-2 shrink-0">
        <button onClick={onClose} className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
          Close Panel
        </button>

        {isApproved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded text-[9px] font-black uppercase tracking-widest shadow-sm">
            <Database className="w-3 h-3" /> Ledger Committed
          </div>
        )}

        {isRejected && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-[9px] font-black uppercase tracking-widest">
            <XCircle className="w-3 h-3" /> Record Voided
          </div>
        )}

        {isPending && (
          <div className="flex gap-2">
            {canReject && (
              <button 
                disabled={isProcessing !== null}
                onClick={() => handleAction("REJECT")}
                className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-[9px] font-black uppercase tracking-widest rounded border border-red-200 dark:border-red-900/30 disabled:opacity-50 transition-all"
              >
                {isProcessing === "REJECT" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                Void Receipt
              </button>
            )}

            {canFinalize && (
              <button 
                disabled={isProcessing !== null}
                onClick={() => handleAction("APPROVE")}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest rounded hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50"
              >
                {isProcessing === "APPROVE" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                Commit to Ledger
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}