"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Building2,
  Scale,
  Settings,
  ShieldCheck,
  RefreshCw,
  Plus,
  Edit3,
  X,
  Save,
  Loader2,
  CheckCircle2,
  MapPin,
  Globe,
  Database
} from "lucide-react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

/* -------------------------
   Types
------------------------- */

interface IOrgData {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

interface IUoM {
  id: string;
  name: string;
  abbreviation: string;
  active: boolean;
}

interface IPreference {
  id: string;
  category: string;
  key: string;
  value: any;
}

/* -------------------------
   Main Component
------------------------- */

export default function OrganizationWorkspace({ organizationId }: { organizationId: string }) {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const [activeTab, setActiveTab] = useState<"profile" | "uoms" | "preferences">("profile");
  const [isPending, startTransition] = useTransition();

  const [orgData, setOrgData] = useState<IOrgData | null>(null);
  const [uoms, setUoms] = useState<IUoM[]>([]);
  const [preferences, setPreferences] = useState<IPreference[]>([]);

  // Modals
  const [isUomModalOpen, setIsUomModalOpen] = useState(false);
  const [editingUom, setEditingUom] = useState<IUoM | null>(null);

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

        setOrgData(data.org);
        setUoms(data.uoms || []);
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

  /* -------------------------
     Render
  ------------------------- */

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

        {/* TAB NAVIGATION */}
        <div className="flex px-4 gap-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={Building2} label="General Profile" />
          <TabButton active={activeTab === "uoms"} onClick={() => setActiveTab("uoms")} icon={Scale} label="Units of Measure" />
          <TabButton active={activeTab === "preferences"} onClick={() => setActiveTab("preferences")} icon={Settings} label="Global Preferences" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
          
          {/* STATS */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <StatCard title="System Status" value={orgData?.active ? "ACTIVE" : "INACTIVE"} icon={ShieldCheck} color="emerald" />
            <StatCard title="Registered UoMs" value={String(uoms.length)} sub="Measurement Standards" icon={Scale} color="blue" />
            <StatCard title="Global Preferences" value={String(preferences.length)} sub="System configurations" icon={Database} color="amber" />
          </section>

          {/* DYNAMIC CONTENT AREA */}
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
                  <div>
                    <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Measurement Standards</h2>
                  </div>
                  <button onClick={() => { setEditingUom(null); setIsUomModalOpen(true); }} className="flex h-8 px-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-indigo-700 transition-all items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Register UoM
                  </button>
                </div>

                <div className="overflow-x-auto custom-scrollbar flex-1">
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
                      {uoms.length === 0 ? (
                        <tr><td colSpan={4} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">No UoMs defined.</td></tr>
                      ) : (
                        uoms.map(u => (
                          <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                            <td className="px-5 py-3">
                              <span className="text-[13px] font-bold text-slate-900 dark:text-white">{u.name}</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono font-bold">{u.abbreviation}</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${u.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"} dark:bg-opacity-10 dark:border-opacity-30`}>
                                {u.active ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => { setEditingUom(u); setIsUomModalOpen(true); }} className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 transition-colors">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
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
                  {preferences.length === 0 ? (
                    <div className="text-center text-slate-400 text-[11px] font-bold uppercase py-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">No global preferences set</div>
                  ) : (
                    preferences.map(pref => (
                      <div key={pref.id} className="p-4 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 rounded-xl flex justify-between items-center">
                        <div>
                          <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-1 block">{pref.category}</span>
                          <span className="text-[13px] font-bold text-slate-900 dark:text-white">{pref.key}</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1 rounded border border-slate-200 dark:border-slate-700">
                          {JSON.stringify(pref.value)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* UOM MODAL */}
      {isUomModalOpen && (
        <UomModal 
          uom={editingUom} 
          onClose={() => setIsUomModalOpen(false)} 
          onRefresh={loadData} 
        />
      )}
    </div>
  );
}

/* -------------------------
   Subcomponents
------------------------- */

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 py-3 border-b-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
        active 
          ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" 
          : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function StatCard({ title, value, sub, icon: Icon, color }: any) {
  const colorMap: any = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-indigo-600 dark:text-indigo-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  const iconColorMap: any = {
    emerald: "text-emerald-200 dark:text-emerald-900/50",
    blue: "text-indigo-200 dark:text-indigo-900/50",
    amber: "text-amber-200 dark:text-amber-900/50",
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <p className={`text-[10px] font-bold uppercase tracking-wider ${colorMap[color] || "text-slate-500 dark:text-slate-400"}`}>
        {title}
      </p>
      <div className="flex items-end justify-between mt-2">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
        <Icon className={`w-5 h-5 ${iconColorMap[color] || "text-slate-300 dark:text-slate-600"}`} />
      </div>
      {sub && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{sub}</span>}
    </div>
  );
}

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