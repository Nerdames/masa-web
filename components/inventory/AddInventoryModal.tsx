"use client";

import React, { useState, useEffect } from "react";
import { createInventoryItem } from "@/app/actions/inventory";
import { useAlerts } from "@/components/feedback/AlertProvider";

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: { id: string; name: string }[];
}

export default function AddInventoryModal({ isOpen, onClose, categories }: AddModalProps) {
  // Use useAlerts as defined in your AlertProvider.tsx
  const { dispatch } = useAlerts();
  const [loading, setLoading] = useState(false);

  // Prevent background scrolling when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const result = await createInventoryItem(formData);

    if (result.success) {
      // Using dispatch with parameters matching your AlertProvider's MASAAlert type
      dispatch({ 
        kind: "TOAST",
        type: "SUCCESS", 
        title: "Success", 
        message: "New inventory item successfully recorded." 
      });
      onClose();
    } else {
      dispatch({ 
        kind: "TOAST",
        type: "ERROR", 
        title: "Action Failed", 
        message: result.error || "Failed to add product." 
      });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm animate-in fade-in" 
        onClick={onClose} 
      />
      
      {/* Modal Container */}
      <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-black text-gray-800 tracking-tight">Add New Inventory</h3>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-full transition-colors outline-none focus:ring-2 focus:ring-[#4F39F6]"
          >
            <i className='bx bx-x text-2xl'></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Product Name *</label>
              <input 
                name="name" 
                required 
                disabled={loading} 
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4F39F6] text-sm font-medium outline-none transition-shadow disabled:opacity-50" 
                placeholder="e.g. Wireless Mouse" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">SKU / Code *</label>
              <input 
                name="sku" 
                required 
                disabled={loading} 
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4F39F6] text-sm font-medium outline-none transition-shadow disabled:opacity-50" 
                placeholder="WM-001" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Category *</label>
            <div className="relative">
              <select 
                name="categoryId" 
                required 
                defaultValue="" 
                disabled={loading} 
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4F39F6] text-sm font-medium appearance-none outline-none transition-shadow disabled:opacity-50"
              >
                <option value="" disabled>Select a category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <i className='bx bx-chevron-down absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xl'></i>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-gray-50 pt-6 mt-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Initial Stock</label>
              <input 
                name="stock" 
                type="number" 
                min="0" 
                required 
                disabled={loading} 
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4F39F6] text-sm font-bold outline-none transition-shadow disabled:opacity-50" 
                placeholder="0" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Selling Price (₦)</label>
              <input 
                name="sellingPrice" 
                type="number" 
                min="0" 
                step="0.01" 
                required 
                disabled={loading} 
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4F39F6] text-sm font-bold outline-none transition-shadow disabled:opacity-50" 
                placeholder="0.00" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-400 tracking-widest ml-1">Reorder Level</label>
              <input 
                name="reorderLevel" 
                type="number" 
                min="0" 
                required 
                disabled={loading} 
                className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4F39F6] text-sm font-bold outline-none transition-shadow disabled:opacity-50" 
                placeholder="5" 
              />
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={loading} 
              className="flex-1 py-4 rounded-2xl border border-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-[2] px-8 py-4 bg-[#4F39F6] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#4F39F6]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {loading ? <i className='bx bx-loader-alt animate-spin text-xl'></i> : "Confirm & Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}