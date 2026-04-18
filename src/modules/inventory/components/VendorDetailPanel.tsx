"use client";

import React from "react";
import { 
  X, 
  Package, 
  CheckCircle2, 
  Mail, 
  Phone, 
  MapPin, 
  Archive 
} from "lucide-react";

interface IVendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  deletedAt?: string | null;
  _count?: { 
    purchaseOrders: number; 
    grns: number 
  };
}

interface VendorDetailPanelProps {
  vendor: IVendor;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

export function VendorDetailPanel({ 
  vendor, 
  onClose, 
  onEdit, 
  onArchive 
}: VendorDetailPanelProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/20 dark:bg-slate-950/50 backdrop-blur-sm z-[90] transition-opacity"
        onClick={onClose}
      />
      
      {/* Slide-out Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[380px] bg-white dark:bg-slate-900 shadow-2xl z-[150] flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-100 dark:border-slate-800">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-black/[0.04] flex items-center justify-between bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-20">
            <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <i className="bx bx-shield-quarter text-sm text-indigo-500" /> Node Inspector
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-all active:scale-90"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-12">
            {/* Vendor Identity */}
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 shrink-0 rounded-[1.25rem] bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center text-2xl font-black shadow-lg">
                {vendor.name.split(" ").map(s => s[0]).slice(0, 2).join("")}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight truncate tracking-tight">
                  {vendor.name}
                </h3>
                <p className="text-[12px] font-medium text-slate-400 truncate lowercase mt-0.5">
                  {vendor.email || "—"}
                </p>
                <div className="text-[10px] text-slate-400 font-mono mt-1 uppercase">
                  {vendor.id}
                </div>
              </div>
            </div>

            {/* Metrics & Connectivity */}
            <div className="space-y-4 border-t border-black/[0.03] pt-6">
              <div className="grid grid-cols-2 gap-4">
                <ProfileField 
                  label="Purchase Orders" 
                  value={String(vendor._count?.purchaseOrders || 0)} 
                  icon={Package} 
                />
                <ProfileField 
                  label="Receipts (GRNs)" 
                  value={String(vendor._count?.grns || 0)} 
                  icon={CheckCircle2} 
                />
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Node Connectivity
                </h4>
                <ContactRow icon={Mail} label="Official Email" value={vendor.email || "No email provided"} />
                <ContactRow icon={Phone} label="Primary Contact" value={vendor.phone || "No contact provided"} />
                <ContactRow icon={MapPin} label="Base Location" value={vendor.address || "No address provided"} />
              </div>
            </div>
          </div>

          {/* Action Footer */}
          {!vendor.deletedAt && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
              <button
                onClick={onEdit}
                className="flex-1 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Modify Entry
              </button>

              <button
                onClick={onArchive}
                className="px-4 py-2 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-500 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                title="Archive Vendor"
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Internal Sub-components */
function ProfileField({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-black/[0.03] dark:border-white/[0.03]">
      <Icon className="w-4 h-4 text-indigo-500 mb-2" />
      <div className="text-[18px] font-black text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-tight">{label}</div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{label}</div>
        <div className="text-[12px] text-slate-700 dark:text-slate-300 font-medium truncate">{value}</div>
      </div>
    </div>
  );
}