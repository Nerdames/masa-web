"use client";

import React, { useState } from "react";
import { InventoryItem } from "@/types/service/inventory";
import { useAlerts } from "@/components/feedback/AlertProvider";
import { PropertyRow } from "@/components/personnel/PropertyRow";

interface ProductDetailsPanelProps {
  item: InventoryItem;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}

export const ProductDetailsPanel = ({ 
  item, 
  onClose, 
  onDelete 
}: ProductDetailsPanelProps) => {
  const { dispatch } = useAlerts();
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  
  const stockValue = Number(item.sellingPrice || 0) * item.stock;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    dispatch({
      kind: "TOAST",
      type: "SUCCESS",
      title: "Copied",
      message: `${label} saved to clipboard.`
    });
  };

  return (
    <div className="h-full flex flex-col w-[340px] bg-white relative font-sans border-l border-black/[0.04]">
      {/* --- Inspector Header --- */}
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white shrink-0 z-10">
        <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <i className="bx bx-package text-sm" /> Inventory Inspector
        </div>
        <button 
          onClick={onClose} 
          className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-all active:scale-90"
        >
          <i className="bx bx-x text-xl" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* --- Identity Block --- */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="w-16 h-16 shrink-0 rounded-[1.25rem] bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-100">
              {item.product.name.charAt(0)}
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-slate-400 shadow-sm">
              <i className="bx bx-barcode text-[12px]" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black text-slate-900 leading-tight truncate tracking-tight uppercase">
              {item.product.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[11px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-black/[0.03]">
                {item.product.sku}
              </p>
              <button onClick={() => copyToClipboard(item.product.sku, "SKU")} className="text-slate-300 hover:text-indigo-500 transition-colors">
                <i className="bx bx-copy text-xs" />
              </button>
            </div>
          </div>
        </div>

        {/* --- Core Inventory Metrics --- */}
        <div className="space-y-4 border-t border-black/[0.03] pt-4">
          <PropertyRow 
            icon="bx bx-line-chart" 
            label="Stock Level" 
            value={
              <div className={`
                flex items-center gap-2 px-2 py-1 rounded-md border text-[10px] font-black uppercase w-fit
                ${item.stock > item.reorderLevel 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                  : "bg-amber-50 text-amber-600 border-amber-100"
                }
              `}>
                <span className={`w-1.5 h-1.5 rounded-full ${item.stock > 0 ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {item.stock > item.reorderLevel ? "In Stock" : item.stock === 0 ? "Out of Stock" : "Low Stock"}
              </div>
            } 
          />

          <PropertyRow 
            icon="bx bx-archive" 
            label="Current Quantity" 
            value={
              <span className="font-mono text-[13px] font-black text-slate-700">
                {item.stock} <span className="text-[10px] text-slate-400 font-bold uppercase ml-1">{item.unit || 'pcs'}</span>
              </span>
            } 
          />

          <PropertyRow 
            icon="bx bx-coin-stack" 
            label="Asset Valuation" 
            value={
              <span className="text-[12px] font-black text-emerald-600 tracking-tight">
                ₦{stockValue.toLocaleString()}
              </span>
            } 
          />
        </div>

        {/* --- Financials & Thresholds --- */}
        <div className="space-y-3 pt-2">
          <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Procurement Parameters</h4>
          <div className="grid grid-cols-1 gap-2">
             <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-black/[0.02]">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Selling Price</span>
                <span className="text-[11px] font-black text-slate-700">₦{Number(item.sellingPrice).toLocaleString()}</span>
             </div>
             <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-black/[0.02]">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Reorder Point</span>
                <span className="text-[11px] font-black text-slate-700">{item.reorderLevel} {item.unit}</span>
             </div>
          </div>
        </div>

        {/* --- Action Suite --- */}
        <div className="pt-6 border-t border-black/[0.03]">
          <div className="space-y-3">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Controls</h4>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 text-slate-600">
                <i className="bx bx-barcode-reader text-base" /> Barcode
              </button>
              <button className="flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 text-slate-600">
                <i className="bx bx-printer text-base" /> Label
              </button>
            </div>
          </div>
        </div>

        {/* --- Collapsible Telemetry --- */}
        <div className="pt-6">
          <button 
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl group transition-all"
          >
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Stock Telemetry</span>
            <i className={`bx bx-chevron-down text-lg transition-transform duration-300 ${isLogExpanded ? "rotate-180" : ""}`} />
          </button>
          
          {isLogExpanded && (
            <div className="mt-4 space-y-4 px-2 animate-in fade-in slide-in-from-top-2">
              <div className="border-l-2 border-slate-100 pl-4 space-y-4">
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />
                  <p className="text-[10px] font-bold text-slate-800 uppercase">Last Restocked</p>
                  <p className="text-[9px] text-slate-400">{item.lastRestockedAt ? new Date(item.lastRestockedAt).toLocaleString() : "No recent intake"}</p>
                </div>
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-blue-500 border-2 border-white" />
                  <p className="text-[10px] font-bold text-slate-800 uppercase">Last Transaction</p>
                  <p className="text-[9px] text-slate-400">{item.lastSoldAt ? new Date(item.lastSoldAt).toLocaleString() : "No sales recorded"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Danger Zone --- */}
        <div className="pt-6 border-t border-black/[0.03]">
          <button 
            onClick={() => confirm(`Purge ${item.product.name} from branch registry?`) && onDelete(item.id)} 
            className="w-full flex items-center justify-center gap-2 px-3 py-4 text-[10px] font-black uppercase tracking-[0.2em] border border-red-100 text-red-500 bg-red-50/50 rounded-2xl hover:bg-red-500 hover:text-white transition-all group"
          >
            <i className="bx bx-trash text-lg group-hover:animate-bounce" /> Purge From Branch
          </button>
        </div>
      </div>
    </div>
  );
};