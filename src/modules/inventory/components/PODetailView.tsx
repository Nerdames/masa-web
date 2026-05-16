"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X, Maximize2, Minimize2, Save, Loader2,
  Package, CheckCircle2, AlertOctagon, Archive, ShieldAlert,
  Phone, Mail, History, XCircle, Edit3, Send,
  FileText
} from "lucide-react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { usePermission } from "@/core/hooks/usePermission";
import { PermissionAction, Resource } from "@prisma/client";
import GRNDetailView from "@/modules/inventory/components/GRNDetailView";

/* -------------------------------------------------------------------------- */
/* TYPES & INTERFACES (Synchronized with MASA Schema)                         */
/* -------------------------------------------------------------------------- */

interface POItem {
  id: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
  product?: {
    name: string;
    sku: string;
    barcode?: string;
    uom?: {
      abbreviation: string;
      name: string;
    }
  };
}

interface PO {
  id: string;
  poNumber: string;
  organizationId: string;
  branchId: string;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_RECEIVED" | "FULFILLED" | "CANCELLED"; 
  totalAmount: number | string;
  currency: string;
  expectedDate?: string | null;
  createdAt: string;
  notes?: string;
  vendor?: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
  };
  createdBy?: { name: string | null };
  approvedBy?: { name: string | null };
  items: POItem[];
}

interface ReceiveItemInput {
  poItemId: string;
  productId: string;
  quantityAccepted: number;
}

interface PODetailViewProps {
  po: PO;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS & STYLES (Enterprise Visibility Fix)                             */
/* -------------------------------------------------------------------------- */

const inputClass = `
  w-full border border-slate-200 dark:border-slate-700 rounded-md text-xs p-2
  bg-white dark:bg-slate-950 text-slate-900 dark:text-white
  focus:ring-1 focus:ring-emerald-500 outline-none transition-all
  placeholder:text-slate-400 disabled:opacity-50 disabled:bg-slate-50
`;

const labelClass = "block text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1";

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function PODetailView({ po, onClose }: PODetailViewProps) {
  const { isFullScreen, toggleFullScreen, openPanel } = useSidePanel();
  const { dispatch } = useAlerts();
  const { can } = usePermission();

  // Permission Logic [cite: 1, 3]
  const canEdit = can(PermissionAction.UPDATE, Resource.PROCUREMENT);
  const canVoid = can(PermissionAction.VOID, Resource.PROCUREMENT);
  const canApprove = can(PermissionAction.APPROVE, Resource.PROCUREMENT); // For Issuing

  // States
  const [isVoiding, setIsVoiding] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [hasRejectedReceipt, setHasRejectedReceipt] = useState(false);

  // Draft Edit States
  const [editedItems, setEditedItems] = useState<POItem[]>(po.items);
  const [expectedDate, setExpectedDate] = useState(po.expectedDate ? new Date(po.expectedDate).toISOString().split('T')[0] : "");
  const [notes, setNotes] = useState(po.notes || "");

  const isCancelled = po.status === "CANCELLED";
  const isFulfilled = po.status === "FULFILLED";
  const isPartiallyReceived = po.status === "PARTIALLY_RECEIVED";
  const isDraft = po.status === "DRAFT";
  const currencySymbol = po.currency === "NGN" ? "₦" : po.currency + " ";
  
  const canVoidCurrentState = canVoid && !isCancelled && !isFulfilled && !isPartiallyReceived && !hasRejectedReceipt;

  // Verify receipt safety
  useEffect(() => {
    async function checkReceiptStatus() {
      try {
        const res = await fetch(`/api/inventory/grns?purchaseOrderId=${po.id}`);
        if (res.ok) {
          const data = await res.json();
          const grns = data.items || data.grns || [];
          const rejected = grns.some((g: any) => g.status === "REJECTED");
          setHasRejectedReceipt(rejected);
        }
      } catch (e) {
        console.error("Failed to verify receipt status safety", e);
      }
    }
    checkReceiptStatus();
  }, [po.id]);

  const [receiveItems, setReceiveItems] = useState<ReceiveItemInput[]>(
    po.items.map((it) => ({
      poItemId: it.id,
      productId: it.productId, 
      quantityAccepted: Math.max(0, it.quantityOrdered - (it.quantityReceived || 0)),
    }))
  );

  useEffect(() => {
    setEditedItems(po.items);
    setExpectedDate(po.expectedDate ? new Date(po.expectedDate).toISOString().split('T')[0] : "");
    setNotes(po.notes || "");
    setReceiveItems(
      po.items.map((it) => ({
        poItemId: it.id,
        productId: it.productId,
        quantityAccepted: Math.max(0, it.quantityOrdered - (it.quantityReceived || 0)),
      }))
    );
  }, [po]);

  /* --- API Handlers --- */

  const handleUpdate = async (targetStatus?: string) => {
    const loadingState = targetStatus === "ISSUED" ? setIsIssuing : setIsSaving;
    loadingState(true);
    
    try {
      const payload: any = {
        status: targetStatus,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
      };

      if (isDraft) {
        payload.items = editedItems.map(it => ({
          productId: it.productId,
          quantityOrdered: Number(it.quantityOrdered),
          unitCost: Number(it.unitCost)
        }));
      }

      const res = await fetch(`/api/inventory/procurement/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = typeof data.error === 'object' ? Object.values(data.error).flat().join(", ") : data.error;
        throw new Error(errorMsg || "Update failed");
      }

      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: targetStatus === "ISSUED" ? "PO Issued" : "Draft Updated", 
        message: targetStatus === "ISSUED" ? `${po.poNumber} is now active.` : "Changes saved successfully." 
      });

      window.dispatchEvent(new CustomEvent("po:updated", { detail: { id: po.id, action: targetStatus || "UPDATE" } }));
      if (targetStatus === "ISSUED") onClose();
      setIsEditing(false);
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
    } finally {
      loadingState(false);
    }
  };

  const handleVoid = async () => {
    if (!canVoidCurrentState) return;
    const reason = window.prompt(`Please provide a reason for voiding PO ${po.poNumber}:`);
    if (reason === null) return; // cancelled prompt
    
    setIsVoiding(true);
    try {
      const res = await fetch(`/api/inventory/procurement/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to void purchase order");

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "PO Voided", message: `Successfully cancelled ${po.poNumber}` });
      window.dispatchEvent(new CustomEvent("po:updated", { detail: { id: po.id, action: "VOID" } }));
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Void failed", message: err.message });
    } finally {
      setIsVoiding(false);
    }
  };

  const updateEditItem = (index: number, field: keyof POItem, value: number) => {
    setEditedItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const submitReceive = async () => {
    const activeItems = receiveItems.filter((it) => it.quantityAccepted > 0);
    if (activeItems.length === 0) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Receive failed", message: "Enter at least one quantity." });
      return;
    }

    setIsReceiving(true);
    try {
      const payload = {
        purchaseOrderId: po.id,
        branchId: po.branchId,
        vendorId: po.vendor?.id,
        status: "PENDING", 
        items: activeItems.map((it) => {
          const original = po.items.find((p) => p.id === it.poItemId);
          return {
            poItemId: it.poItemId,
            productId: String(original?.productId),
            quantityAccepted: it.quantityAccepted,
            quantityRejected: 0,
            unitCost: original?.unitCost ? Number(original.unitCost) : 0,
            totalCost: it.quantityAccepted * (original?.unitCost ? Number(original.unitCost) : 0)
          };
        }),
      };

      const res = await fetch(`/api/inventory/grns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to create GRN");

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Receipt Created", message: `GRN ${body.grnNumber || 'created'} is awaiting approval.` });
      window.dispatchEvent(new CustomEvent("po:updated", { detail: { id: po.id, action: "RECEIVE", grnId: body?.id } }));
      setReceiveOpen(false);
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Receive failed", message: err.message });
    } finally {
      setIsReceiving(false);
    }
  };

  const handleViewHistory = async () => {
    setIsFetchingHistory(true);
    try {
      const res = await fetch(`/api/inventory/grns?purchaseOrderId=${po.id}`);
      if (!res.ok) throw new Error("Failed to fetch receipt history.");
      const data = await res.json();
      const grns = data.items || data.grns || [];

      if (grns.length === 0) {
        dispatch({ kind: "TOAST", type: "INFO", title: "No History", message: "No receipts found for this Purchase Order yet." });
        return;
      }
      const latestGrn = grns[0];
      openPanel(<GRNDetailView grn={latestGrn} onClose={onClose} />, `Receipt: ${latestGrn.grnNumber}`);
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Fetch failed", message: err.message });
    } finally {
      setIsFetchingHistory(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-2xl relative overflow-hidden">
      
      {/* --- HEADER --- */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isDraft ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {po.poNumber}
              </h2>
              {isDraft && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 uppercase">Draft</span>}
              {isPartiallyReceived && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase">Partial</span>}
              {isFulfilled && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase">Fulfilled</span>}
              {isCancelled && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 uppercase">Void</span>}
            </div>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
              Procurement Details V3.1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleFullScreen} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* --- BODY --- */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {(!canEdit && isDraft) && (
          <div className="mb-4 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-[9px] font-medium text-amber-800 dark:text-amber-400">
              <span className="font-bold uppercase">View Only:</span> Insufficient permissions to modify this purchase order.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Section 1: Core Identity & Vendor */}
          <section className="space-y-3">
            <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">
              Supplier & Logistics
            </h3>

            <div className={`grid gap-3 ${isFullScreen ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              {/* Vendor Card */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                 <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Vendor Details
                </h4>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{po.vendor?.name}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <Mail className="w-3 h-3" /> {po.vendor?.email || "N/A"}
                  </div>
                  {po.vendor?.phone && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <Phone className="w-3 h-3" /> {po.vendor?.phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Logistics & Meta */}
              <div className="space-y-2">
                 <div className="space-y-1">
                  <label className={labelClass}>Expected Delivery</label>
                  {isEditing ? (
                     <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} />
                  ) : (
                     <div className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-md border border-slate-100 dark:border-slate-700/50">
                        {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "TBD"}
                     </div>
                  )}
                 </div>
                 <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className={labelClass}>Currency</label>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-md border border-slate-100 dark:border-slate-700/50">
                        {po.currency}
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className={labelClass}>Created By</label>
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-md border border-slate-100 dark:border-slate-700/50 truncate">
                        {po.createdBy?.name || "System"}
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          </section>

          {/* Section 2: Financials & Items */}
          <section className="space-y-3">
            <div className="flex justify-between items-end border-b border-slate-100 dark:border-slate-800 pb-1">
              <h3 className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {isEditing ? "Edit Line Items" : "Financial Master Data"}
              </h3>
              {!isDraft && (
                <button 
                  onClick={handleViewHistory}
                  disabled={isFetchingHistory}
                  className="flex items-center gap-1 text-[8px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 transition-colors uppercase disabled:opacity-50"
                >
                  {isFetchingHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
                  Receipt History
                </button>
              )}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-x-auto">
              <table className="w-full text-left min-w-[500px]">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-500 uppercase">Product</th>
                    <th className="px-2 py-2 text-[8px] font-bold text-slate-500 uppercase text-center">UOM</th>
                    <th className="px-2 py-2 text-[8px] font-bold text-slate-500 uppercase text-center">Qty Ordered</th>
                    <th className="px-2 py-2 text-[8px] font-bold text-slate-500 uppercase text-center">{isEditing ? "Unit Cost" : "Received"}</th>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-500 uppercase text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {editedItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2">
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-[10px] md:text-xs line-clamp-1">{item.product?.name}</p>
                        <span className="text-[8px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-500 font-mono mt-0.5 inline-block">{item.product?.sku}</span>
                      </td>
                      <td className="px-2 py-2 text-center text-[9px] text-slate-500 uppercase font-bold">
                        {item.product?.uom?.abbreviation || "unit"}
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-slate-700 dark:text-slate-300 text-[10px] md:text-xs">
                        {isEditing && isDraft ? (
                          <input 
                            type="number" 
                            min={1}
                            value={item.quantityOrdered}
                            onChange={(e) => updateEditItem(idx, "quantityOrdered", Number(e.target.value))}
                            className={`${inputClass} w-16 text-center py-1`}
                          />
                        ) : item.quantityOrdered}
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-[10px] md:text-xs">
                        {isEditing && isDraft ? (
                          <input 
                            type="number" 
                            min={0}
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => updateEditItem(idx, "unitCost", Number(e.target.value))}
                            className={`${inputClass} w-20 text-center py-1`}
                          />
                        ) : (
                          <span className={item.quantityReceived >= item.quantityOrdered ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-500"}>
                            {item.quantityReceived || 0}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white text-[10px] md:text-xs">
                        {currencySymbol}{(item.quantityOrdered * item.unitCost).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
               <div className="text-right">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Grand Total</p>
                  <p className="text-sm md:text-base font-bold text-emerald-600 dark:text-emerald-400">
                     {currencySymbol}
                     {editedItems.reduce((acc, item) => acc + (item.quantityOrdered * item.unitCost), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </p>
               </div>
            </div>
          </section>

          {/* Section 3: Details */}
          <section className="space-y-1 pb-4">
            <label className={labelClass}>Internal Notes</label>
            {isEditing ? (
              <textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                rows={3} 
                className={`${inputClass} resize-none`} 
                placeholder="Additional specifications..." 
              />
            ) : (
              <div className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-md border border-slate-100 dark:border-slate-700/50 min-h-[60px]">
                 {po.notes || <span className="text-slate-400 italic">No notes provided.</span>}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* --- FOOTER ACTIONS --- */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-2 shrink-0">
        
        {isCancelled && (
           <button disabled className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-400 text-[9px] font-bold uppercase rounded-md flex items-center gap-1.5 cursor-not-allowed">
             <AlertOctagon className="w-3.5 h-3.5" /> Order Voided
           </button>
        )}

        {isFulfilled && (
           <button disabled className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold uppercase rounded-md flex items-center gap-1.5 cursor-not-allowed">
             <Archive className="w-3.5 h-3.5" /> Order Fulfilled
           </button>
        )}

        {hasRejectedReceipt && !isCancelled && !isFulfilled && (
           <button disabled className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 text-[9px] font-bold uppercase rounded-md flex items-center gap-1.5 cursor-not-allowed">
             <XCircle className="w-3.5 h-3.5" /> Receipt Rejected
           </button>
        )}

        {(!isCancelled && !isFulfilled && !hasRejectedReceipt) && (
           <>
              {isDraft ? (
                <>
                  <button 
                    type="button" 
                    onClick={isEditing ? () => { setIsEditing(false); setEditedItems(po.items); } : handleVoid} 
                    disabled={isVoiding || isSaving || isIssuing} 
                    className="px-3 py-1.5 text-[9px] font-bold text-red-500 uppercase tracking-widest hover:text-red-700 dark:hover:text-red-400 transition-colors"
                  >
                    {isVoiding ? "Voiding..." : isEditing ? "Cancel" : "Void"}
                  </button>

                  {isEditing ? (
                    <button 
                      onClick={() => handleUpdate()} 
                      disabled={isSaving} 
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save Draft
                    </button>
                  ) : (
                    <>
                      {canEdit && (
                         <button 
                           onClick={() => setIsEditing(true)}
                           className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                         >
                           <Edit3 className="w-3.5 h-3.5" /> Edit
                         </button>
                      )}
                      {canApprove && (
                         <button 
                           onClick={() => handleUpdate("ISSUED")} 
                           disabled={isIssuing} 
                           className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-slate-800 transition-all shadow-lg shadow-slate-500/20 disabled:opacity-50"
                         >
                           {isIssuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                           Issue PO
                         </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <button 
                    type="button" 
                    onClick={handleVoid} 
                    disabled={isVoiding || !canVoidCurrentState} 
                    className="px-3 py-1.5 text-[9px] font-bold text-red-500 uppercase tracking-widest hover:text-red-700 dark:hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Void
                  </button>
                  <button 
                    onClick={() => setReceiveOpen(true)} 
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <Package className="w-3.5 h-3.5" />
                    {isPartiallyReceived ? "Continue Receiving" : "Receive Items"}
                  </button>
                </>
              )}
           </>
        )}
      </div>

      {/* --- RECEIVE OVERLAY MODAL --- */}
      {receiveOpen && (
        <div className="absolute inset-0 z-[100] flex flex-col bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-bottom-4">
           {/* Modal Header */}
           <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
             <div className="flex items-center gap-2">
               <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                 <Package className="w-4 h-4" />
               </div>
               <div>
                 <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                   Log Receipt: {po.poNumber}
                 </h2>
                 <p className="text-[8px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
                   Goods Receipt Note Generation
                 </p>
               </div>
             </div>
             <button type="button" onClick={() => setReceiveOpen(false)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
               <X className="w-4 h-4" />
             </button>
           </div>

           {/* Modal Body */}
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
              {receiveItems.map((it, idx) => {
                const poItem = po.items.find((p) => p.id === it.poItemId);
                const remaining = Math.max(0, (poItem?.quantityOrdered || 0) - (poItem?.quantityReceived || 0));
                return (
                  <div key={it.poItemId} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex justify-between items-start mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[11px] text-slate-800 dark:text-slate-100 truncate">{poItem?.product?.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{poItem?.product?.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Remaining</div>
                        <div className="font-bold text-[11px] text-slate-700 dark:text-slate-300">{remaining} {poItem?.product?.uom?.abbreviation}</div>
                      </div>
                    </div>
                    <label className={labelClass}>Quantity Accepted</label>
                    <input
                      type="number" min={0} max={remaining}
                      value={it.quantityAccepted}
                      onChange={(e) => {
                        const copy = [...receiveItems];
                        copy[idx].quantityAccepted = Math.max(0, Math.floor(Number(e.target.value) || 0));
                        setReceiveItems(copy);
                      }}
                      className={inputClass}
                    />
                  </div>
                );
              })}
           </div>

           {/* Modal Footer */}
           <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end items-center gap-2 shrink-0">
             <button type="button" onClick={() => setReceiveOpen(false)} disabled={isReceiving} className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
               Cancel
             </button>
             <button onClick={submitReceive} disabled={isReceiving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-widest rounded-md hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50">
               {isReceiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
               Confirm Receipt
             </button>
           </div>
        </div>
      )}

    </div>
  );
}