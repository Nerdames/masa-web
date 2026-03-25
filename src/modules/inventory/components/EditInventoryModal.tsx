"use client";

import React, { useState } from "react";
import { useAlerts } from "@/src/core/components/feedback/AlertProvider";
import { adjustInventoryStock } from "@/app/actions/inventory";
import { StockMovementType } from "@prisma/client"; // Ensure enums are imported

interface EditInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any; // BranchProduct joined with Product & Vendor
}

export default function EditInventoryModal({ isOpen, onClose, item }: EditInventoryModalProps) {
  const { dispatch } = useAlerts();
  const [loading, setLoading] = useState(false);
  const [motive, setMotive] = useState<StockMovementType>(StockMovementType.IN);

  if (!isOpen || !item) return null;

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const result = await adjustInventoryStock(item.id, formData);

    if (result.success) {
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Registry Updated", 
        message: "Stock movement ledgered and version synced." 
      });
      onClose();
    } else {
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Integrity Error", 
        message: result.error || "The transaction was rejected by the audit engine." 
      });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-[500px] rounded-[32px] shadow-2xl flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[0.05]">
        
        {/* Audit Header */}
        <div className="px-8 py-6 border-b border-black/[0.04] flex justify-between items-center bg-white shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <i className="bx bx-shield-quarter text-sm" /> Inventory Audit Adjustment
            </div>
            <p className="text-[9px] font-mono font-bold text-indigo-500 mt-1 uppercase">
              Current Version: v{item.stockVersion}.0
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all">
            <i className='bx bx-x text-2xl'></i>
          </button>
        </div>

        <form onSubmit={handleUpdate} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          
          {/* Identity Header */}
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-black/[0.02]">
            <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-black shrink-0">
              {item.product?.name?.charAt(0)}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-black text-slate-900 uppercase truncate tracking-tight">{item.product?.name}</h4>
              <p className="text-[10px] font-mono text-slate-400 font-bold tracking-widest">{item.product?.sku}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase">On Hand</p>
              <p className="text-lg font-black text-slate-900">{item.stock} <span className="text-[10px] text-slate-400">{item.unit || 'pcs'}</span></p>
            </div>
          </div>

          {/* Critical Transaction Hidden Fields */}
          <input type="hidden" name="stockVersion" value={item.stockVersion} />
          <input type="hidden" name="type" value={motive} />

          {/* Movement Type Toggle */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Transaction Intent</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button 
                type="button"
                onClick={() => setMotive(StockMovementType.IN)}
                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${motive === StockMovementType.IN ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"}`}
              >
                Stock Intake (IN)
              </button>
              <button 
                type="button"
                onClick={() => setMotive(StockMovementType.ADJUST)}
                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${motive === StockMovementType.ADJUST ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}
              >
                Reconcile (ADJUST)
              </button>
            </div>
          </div>

          {/* Dynamic Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">
                {motive === StockMovementType.IN ? "Quantity Added" : "Adjustment Offset"}
              </label>
              <div className="relative">
                <input 
                  name="quantity" 
                  type="number" 
                  step="1"
                  placeholder="0"
                  required 
                  className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white text-lg font-black outline-none transition-all" 
                />
              </div>
              <p className="text-[9px] text-slate-400 px-1 italic">Use negative numbers to reduce stock in ADJUST mode.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Current Cost (₦)</label>
              <input 
                name="unitCost" 
                type="number" 
                step="0.01"
                defaultValue={item.costPrice ? Number(item.costPrice) : ""} 
                required 
                className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white text-lg font-black outline-none transition-all" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Reason / Reference</label>
            <textarea 
              name="reason" 
              required
              placeholder={motive === StockMovementType.IN ? "PO Number or Supplier Invoice..." : "Physical count discrepancy reason..."}
              className="w-full px-5 py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-indigo-500 focus:bg-white text-sm font-bold outline-none transition-all min-h-[100px] resize-none"
            />
          </div>

          {/* Finalize Section */}
          <div className="pt-4 border-t border-black/[0.03] space-y-4">
            <div className="flex gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100/50 items-start">
              <i className="bx bx-error-circle text-amber-500 text-lg mt-0.5" />
              <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                Committing this form will trigger a <b>{motive}</b> movement in the ledger. This action is immutable once recorded and will increment the stock version for all branches.
              </p>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full py-5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black shadow-xl shadow-slate-200 transition-all active:scale-[0.98] flex justify-center items-center gap-2"
            >
              {loading ? <i className='bx bx-loader-alt animate-spin text-lg' /> : "Authorize Stock Movement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}