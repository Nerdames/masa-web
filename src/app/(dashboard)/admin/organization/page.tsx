"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import {
  Building2,
  Scale,
  Settings,
  ShieldCheck,
  X,
  CheckSquare,
  RefreshCw,
  Plus,
  Edit3,
  Save,
  Loader2,
  Percent,
  Key
} from "lucide-react";

// Types/Enums imported directly from Prisma to ensure sync
import type { 
  Organization, 
  UnitOfMeasure, 
  TaxRate, 
  Permission, 
  Preference 
} from "@prisma/client";

import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

/* -------------------------
    Main Component
------------------------- */

export default function OrganizationWorkspace({ organizationId }: { organizationId: string }) {
  const { dispatch } = useAlerts();
  const { openPanel } = useSidePanel();

  // Updated Tabs: Removed "branches"
  const [activeTab, setActiveTab] = useState<"profile" | "uoms" | "taxes" | "permissions" | "preferences">("profile");
  const [isPending, startTransition] = useTransition();

  // State using Prisma Types
  const [orgData, setOrgData] = useState<Organization | null>(null);
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);

  // Modals (Excluding Branches)
  const [isUomModalOpen, setIsUomModalOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<UnitOfMeasure | null>(null);

  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [editingTax, setEditingTax] = useState<TaxRate | null>(null);

  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [editingPerm, setEditingPerm] = useState<Permission | null>(null);

  // Time-aware theme
  useEffect(() => {
    const applyTheme = () => {
      const hour = new Date().getHours();
      if (hour >= 19 || hour < 7) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    applyTheme();
    const id = setInterval(applyTheme, 60000);
    return () => clearInterval(id);
  }, []);

  /* -------------------------
      Data Loaders
  ------------------------- */

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/myorg`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load org data");

        // Syncing with your API structure
        setOrgData(data.org);
        setUoms(data.uoms || []);
        setTaxRates(data.taxRates || []);
        setPermissions(data.permissions || []);
        setPreferences(data.preferences || []);
      } catch (err: any) {
        dispatch({ kind: "TOAST", type: "WARNING", title: "Sync Error", message: err.message });
      }
    });
  }, [dispatch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* -------------------------
      Handlers
  ------------------------- */

  const handleProfileSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("orgName") as string;
    
    startTransition(async () => {
      try {
        const res = await fetch("/api/myorg", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "UPDATE_PROFILE", payload: { name } }),
        });
        if (!res.ok) throw new Error("Failed to update profile");
        
        dispatch({ kind: "TOAST", type: "SUCCESS", title: "Profile Updated", message: "Organization name updated successfully." });
        loadData();
      } catch (err: any) {
        dispatch({ kind: "TOAST", type: "WARNING", title: "Update Error", message: err.message });
      }
    });
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-500 animate-spin" />
        </div>
      )}

      {/* HEADER */}
      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[30] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-lg shadow-sm">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">Organization Settings</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={loadData}
              disabled={isPending}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-indigo-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION - Branches removed */}
        <div className="flex px-4 gap-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-x-auto custom-scrollbar">
          <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={Building2} label="General Profile" />
          <TabButton active={activeTab === "uoms"} onClick={() => setActiveTab("uoms")} icon={Scale} label="Units of Measure" />
          <TabButton active={activeTab === "taxes"} onClick={() => setActiveTab("taxes")} icon={Percent} label="Tax Rates" />
          <TabButton active={activeTab === "permissions"} onClick={() => setActiveTab("permissions")} icon={Key} label="Permissions" />
          <TabButton active={activeTab === "preferences"} onClick={() => setActiveTab("preferences")} icon={Settings} label="Global Preferences" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
          
          {/* STATS - Sync'd with counts */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <StatCard title="System Status" value={orgData?.active ? "ACTIVE" : "INACTIVE"} icon={ShieldCheck} color="emerald" />
            <StatCard title="Tax Profiles" value={String(taxRates.length)} sub="Fiscal Configurations" icon={Percent} color="amber" />
            <StatCard title="Access Rules" value={String(permissions.length)} sub="RBAC Policies" icon={Key} color="blue" />
            <StatCard title="UoMs" value={String(uoms.length)} sub="Active Standards" icon={Scale} color="indigo" />
          </section>

          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 transition-colors shadow-sm">
            
            {/* PROFILE TAB */}
            {activeTab === "profile" && (
              <div className="p-8 max-w-2xl animate-in fade-in zoom-in-95 duration-200">
                <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">Organization Profile</h2>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-8">Master identity settings</p>

                <form onSubmit={handleProfileSave} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Legal Organization Name <span className="text-indigo-500">*</span></label>
                    <input 
                      type="text" 
                      name="orgName"
                      required 
                      defaultValue={orgData?.name || ""} 
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-3 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 dark:bg-slate-950 dark:text-white transition-colors" 
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button type="submit" disabled={isPending} className="flex items-center gap-2 px-6 py-2.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-indigo-500/10">
                      {isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Update Registry
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* UOM TAB */}
            {activeTab === "uoms" && (
              <div className="flex flex-col h-full animate-in fade-in duration-200">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Measurement Standards</h2>
                  <button onClick={() => { setEditingUom(null); setIsUomModalOpen(true); }} className="flex h-8 px-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-indigo-700 transition-all items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Register UoM
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unit Name</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Abbreviation</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {uoms.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                          <td className="px-5 py-3"><span className="text-[13px] font-bold text-slate-900 dark:text-white">{u.name}</span></td>
                          <td className="px-5 py-3"><span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono font-bold">{u.abbreviation}</span></td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${u.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                              {u.active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={() => { setEditingUom(u); setIsUomModalOpen(true); }} className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAX RATES TAB */}
            {activeTab === "taxes" && (
               <div className="flex flex-col h-full animate-in fade-in duration-200">
                 <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                   <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Tax Configurations</h2>
                   <button onClick={() => { setEditingTax(null); setIsTaxModalOpen(true); }} className="flex h-8 px-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-indigo-700 transition-all items-center gap-1.5">
                     <Plus className="w-3.5 h-3.5" /> Define Tax Rate
                   </button>
                 </div>
                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse whitespace-nowrap">
                     <thead>
                       <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                         <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tax Name</th>
                         <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rate (%)</th>
                         <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                         <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                       {taxRates.map(t => (
                         <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                           <td className="px-5 py-3"><span className="text-[13px] font-bold text-slate-900 dark:text-white">{t.name}</span></td>
                           <td className="px-5 py-3"><span className="text-[12px] font-bold text-slate-600 dark:text-slate-300">{t.rate}%</span></td>
                           <td className="px-5 py-3">
                             <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${t.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                               {t.active ? "ACTIVE" : "INACTIVE"}
                             </span>
                           </td>
                           <td className="px-5 py-3 text-right">
                             <button onClick={() => { setEditingTax(t); setIsTaxModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600">
                               <Edit3 className="w-3.5 h-3.5" />
                             </button>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
            )}

            {/* PERMISSIONS TAB */}
            {activeTab === "permissions" && (
              <div className="flex flex-col h-full animate-in fade-in duration-200">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                  <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Access Control Rules</h2>
                  <button onClick={() => { setEditingPerm(null); setIsPermModalOpen(true); }} className="flex h-8 px-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-indigo-700 transition-all items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add Permission
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Resource</th>
                        <th className="px-5 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {permissions.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-5 py-3"><span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded uppercase">{p.role}</span></td>
                          <td className="px-5 py-3"><span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{p.action}</span></td>
                          <td className="px-5 py-3"><span className="text-[12px] font-mono font-medium text-slate-800 dark:text-slate-200">{p.resource}</span></td>
                          <td className="px-5 py-3 text-right">
                             <button onClick={() => { setEditingPerm(p); setIsPermModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600"><Edit3 className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PREFERENCES TAB */}
            {activeTab === "preferences" && (
              <div className="p-8 max-w-2xl animate-in fade-in zoom-in-95 duration-200">
                <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">Global Configuration</h2>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-8">System-wide behavior limits</p>
                <div className="space-y-4">
                  {preferences.map(pref => (
                    <div key={pref.id} className="p-4 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 rounded-xl flex justify-between items-center">
                      <div>
                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-1 block">{pref.category}</span>
                        <span className="text-[13px] font-bold text-slate-900 dark:text-white">{pref.key}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1 rounded border border-slate-200 dark:border-slate-700">
                        {typeof pref.value === 'string' ? pref.value : JSON.stringify(pref.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* MODALS */}
      {isUomModalOpen && (
        <UomModal 
          uom={editingUom} 
          onClose={() => setIsUomModalOpen(false)} 
          onRefresh={loadData} 
        />
      )}

      {isTaxModalOpen && (
        <TaxModal 
          taxRate={editingTax} 
          onClose={() => setIsTaxModalOpen(false)} 
          onRefresh={loadData} 
        />
      )}

      {isPermModalOpen && (
        <PermissionModal 
          permission={editingPerm} 
          onClose={() => setIsPermModalOpen(false)} 
          onRefresh={loadData} 
        />
      )}
    </div>
  );
}

/* -------------------------
    Helper UI Components
------------------------- */

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 py-3 px-1 border-b-2 transition-all whitespace-nowrap ${
        active 
          ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[12px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function StatCard({ title, value, sub, icon: Icon, color }: any) {
  const colors: any = {
    emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
    amber: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20",
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20",
    indigo: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20",
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]} flex items-start justify-between shadow-sm transition-transform hover:scale-[1.02]`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">{title}</p>
        <p className="text-xl font-black">{value}</p>
        {sub && <p className="text-[9px] font-bold uppercase tracking-tighter opacity-70 mt-1">{sub}</p>}
      </div>
      <Icon className="w-5 h-5 opacity-40" />
    </div>
  );
}

/* -------------------------
   Subcomponents (UI)
------------------------- */





/* -------------------------
   Modals
------------------------- */

function UomModal({ uom, onClose, onRefresh }: { uom: IUoM | null; onClose: () => void; onRefresh: () => void; }) {
  const { dispatch } = useAlerts();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: uom?.name || "",
    abbreviation: uom?.abbreviation || "",
    active: uom ? uom.active : true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: any = { ...formData };
      if (uom) payload.id = uom.id;

      const res = await fetch("/api/myorg", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPSERT_UOM", payload }),
      });

      if (!res.ok) throw new Error("Operation failed.");
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Success", message: `UoM ${uom ? "updated" : "registered"}.` });
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">{uom ? "Update UoM Data" : "Register UoM"}</h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">System Measurement Definition</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form id="uom-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Full Unit Name <span className="text-indigo-500">*</span></label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="e.g. Kilograms" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Abbreviation <span className="text-indigo-500">*</span></label>
              <input type="text" required value={formData.abbreviation} onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="e.g. kg" />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="activeToggle" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="rounded text-indigo-600 focus:ring-indigo-500 bg-slate-100 border-slate-300" />
              <label htmlFor="activeToggle" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Active Standard</label>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-widest">Cancel</button>
          <button type="submit" form="uom-form" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-indigo-500/10">
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {uom ? "Update Registry" : "Save Definition"}
          </button>
        </div>
      </div>
    </div>
  );
}


function TaxModal({ taxRate, onClose, onRefresh }: { taxRate: ITaxRate | null; onClose: () => void; onRefresh: () => void; }) {
  const { dispatch } = useAlerts();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: taxRate?.name || "",
    rate: taxRate?.rate || 0,
    active: taxRate ? taxRate.active : true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: any = { ...formData };
      if (taxRate) payload.id = taxRate.id;

      const res = await fetch("/api/myorg", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPSERT_TAX_RATE", payload }),
      });

      if (!res.ok) throw new Error("Operation failed.");
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Success", message: `Tax Rate ${taxRate ? "updated" : "registered"}.` });
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">{taxRate ? "Update Tax Rate" : "Define Tax Rate"}</h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">Fiscal Configuration</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form id="tax-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Tax Name <span className="text-indigo-500">*</span></label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="e.g. VAT 7.5%" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Rate Percentage (%) <span className="text-indigo-500">*</span></label>
              <input type="number" step="0.01" required value={formData.rate} onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="7.5" />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="taxActive" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="rounded text-indigo-600 focus:ring-indigo-500 bg-slate-100 border-slate-300" />
              <label htmlFor="taxActive" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Active Tax Rate</label>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-widest">Cancel</button>
          <button type="submit" form="tax-form" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-indigo-500/10">
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {taxRate ? "Update Tax" : "Save Tax"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionModal({ permission, onClose, onRefresh }: { permission: any | null; onClose: () => void; onRefresh: () => void; }) {
  const { dispatch } = useAlerts();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Since the backend syncs by Role + Resource, we initialize 
  // actions as an array. If editing an existing permission, 
  // we start with that action in the list.
  const [formData, setFormData] = useState({
    role: permission?.role || "CASHIER",
    resource: permission?.resource || "",
    actions: permission ? [permission.action] : [] as string[],
  });

  const roles = ["ADMIN", "MANAGER", "SALES", "INVENTORY", "CASHIER", "DEV", "AUDITOR"];
  const availableActions = ["CREATE", "READ", "UPDATE", "DELETE", "VOID", "APPROVE", "EXPORT"];

  const toggleAction = (action: string) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.actions.length === 0) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Selection Required", message: "Please select at least one action." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/myorg", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "SYNC_PERMISSIONS", 
          payload: {
            targetRole: formData.role,
            resource: formData.resource.toUpperCase().trim(),
            actions: formData.actions
          } 
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Operation failed.");
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Success", message: `Permissions synchronized for ${formData.role}.` });
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Error", message: err.message });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">
              {permission ? "Sync Permissions" : "Add Permission Set"}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">Access Control Configuration</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form id="perm-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Target Role</label>
                <select 
                  required 
                  disabled={!!permission} // Lock role if editing
                  value={formData.role} 
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })} 
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 outline-none bg-white dark:bg-slate-950 dark:text-white disabled:opacity-60"
                >
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Resource Key</label>
                <input 
                  type="text" 
                  required 
                  disabled={!!permission} // Lock resource if editing
                  value={formData.resource} 
                  onChange={(e) => setFormData({ ...formData, resource: e.target.value })} 
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 outline-none bg-white dark:bg-slate-950 dark:text-white uppercase font-mono disabled:opacity-60" 
                  placeholder="e.g. INVOICE" 
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-3">Allowed Actions</label>
              <div className="grid grid-cols-2 gap-2">
                {availableActions.map(action => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => toggleAction(action)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] font-bold transition-all ${
                      formData.actions.includes(action)
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400"
                        : "border-slate-200 dark:border-slate-800 text-slate-500"
                    }`}
                  >
                    {action}
                    {formData.actions.includes(action) && <CheckSquare className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-widest">Cancel</button>
          <button type="submit" form="perm-form" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-indigo-500/10">
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Sync Permissions
          </button>
        </div>
      </div>
    </div>
  );
}