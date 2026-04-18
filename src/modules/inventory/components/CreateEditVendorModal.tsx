"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw, Save } from "lucide-react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

interface IVendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

interface CreateEditVendorModalProps {
  vendor: IVendor | null;
  organizationId: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function CreateEditVendorModal({ 
  vendor, 
  organizationId, 
  onClose, 
  onRefresh 
}: CreateEditVendorModalProps) {
  const { dispatch } = useAlerts();
  const [formData, setFormData] = useState({
    name: vendor?.name || "",
    email: vendor?.email || "",
    phone: vendor?.phone || "",
    address: vendor?.address || "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFormData({
      name: vendor?.name || "",
      email: vendor?.email || "",
      phone: vendor?.phone || "",
      address: vendor?.address || "",
    });
  }, [vendor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: any = { ...formData, organizationId };
      if (vendor) payload.id = vendor.id;

      const res = await fetch("/api/vendors", {
        method: vendor ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Operation failed.");

      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: vendor ? "Vendor Updated" : "Vendor Registered", 
        message: `Successfully ${vendor ? "modified" : "added"} ${data.name || "the vendor"}.` 
      });
      
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Registration Error", 
        message: err.message || "Operation failed" 
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">
              {vendor ? "Update Node Data" : "Register Vendor Node"}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">
              MASA Core Directory Persistence
            </p>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          <form id="vendor-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Legal Name <span className="text-emerald-500">*</span>
              </label>
              <input 
                type="text" 
                required 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" 
                placeholder="Apex Logistics Ltd" 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Email Connectivity</label>
                <input 
                  type="email" 
                  value={formData.email || ""} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" 
                  placeholder="operations@apex.com" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Phone Network</label>
                <input 
                  type="tel" 
                  value={formData.phone || ""} 
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })} 
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" 
                  placeholder="+234..." 
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Operational Base</label>
              <textarea 
                value={formData.address || ""} 
                onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
                rows={2} 
                className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors" 
                placeholder="Full street address..." 
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isSubmitting} 
            className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-widest"
          >
            Cancel
          </button>

          <button 
            type="submit" 
            form="vendor-form" 
            disabled={isSubmitting} 
            className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-emerald-500/10"
          >
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {vendor ? "Update Registry" : "Save Node"}
          </button>
        </div>
      </div>
    </div>
  );
}