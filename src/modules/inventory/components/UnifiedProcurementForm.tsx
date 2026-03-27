"use client";

import React, { useState } from "react";
import { useSidePanel } from "@/src/core/context/SidePanelContext";
import { processUnifiedProcurement } from "@/src/core/actions/inventory";

// Passing pre-selected product context to ensure strict data relations
interface UnifiedProcurementFormProps {
  productId: string;
  branchProductId: string; 
  defaultCost: number;
}

export default function UnifiedProcurementForm({ productId, branchProductId, defaultCost }: UnifiedProcurementFormProps) {
  const { closePanel } = useSidePanel();
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);

    const formData = new FormData(event.currentTarget);
    formData.append("productId", productId);
    formData.append("branchProductId", branchProductId);

    const result = await processUnifiedProcurement(formData);

    setIsPending(false);
    if (result.success) {
      closePanel();
    } else {
      setErrorMsg(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-slate-50">
      <div className="p-6 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-slate-900">Unified Procurement</h3>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Chain_Secure</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">Auto-Generates: PO → Stock → Order → Invoice → Sale</p>
      </div>

      <div className="flex-1 p-6 space-y-5 overflow-y-auto">
        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-600 rounded-md text-xs font-semibold border border-red-100">
            {errorMsg}
          </div>
        )}

        <section className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <i className="bx bx-store-alt" /> Vendor ID
            </span>
            <input name="vendorId" required placeholder="Vendor ID..." className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <i className="bx bx-package" /> Quantity
            </span>
            <input name="quantity" type="number" min="1" required className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <i className="bx bx-down-arrow-alt" /> Cost (₦)
            </span>
            <input name="costPrice" type="number" step="0.01" defaultValue={defaultCost} required className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm outline-none" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <i className="bx bx-up-arrow-alt" /> Sale (₦)
            </span>
            <input name="sellingPrice" type="number" step="0.01" required className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm outline-none" />
          </label>
        </section>

        <section className="pt-4 border-t border-slate-200">
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
              <i className="bx bx-user-voice" /> Customer ID
            </span>
            <input name="customerId" required placeholder="Target Customer ID" className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </section>
      </div>

      <div className="p-6 bg-white border-t border-slate-200">
        <button
          type="submit"
          disabled={isPending}
          className="w-full h-12 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isPending ? <i className="bx bx-loader-alt animate-spin text-lg" /> : <i className="bx bx-shield-quarter text-lg" />}
          {isPending ? "Anchoring to Ledger..." : "Execute Fortress Transaction"}
        </button>
      </div>
    </form>
  );
}
