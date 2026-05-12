"use client";

import React, { useCallback, useEffect, useState, useTransition, useMemo } from "react";
import {
  Building2,
  Scale,
  ShieldCheck,
  RefreshCw,
  Plus,
  Edit3,
  Save,
  Loader2,
  Percent,
  Settings2,
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  Shield,
  Search
} from "lucide-react";

import type { 
  Organization, 
  UnitOfMeasure, 
  TaxRate,
  Preference,
  ResourcePermission,
} from "@prisma/client";

import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

// Panel Components
import { PermissionPanel } from "@/modules/myorg/components/PermissionPanel";
import { UomPanel } from "@/modules/myorg/components/UomPanel";
import { TaxPanel } from "@/modules/myorg/components/TaxPanel";
import { PreferencePanel } from "@/modules/myorg/components/PreferencePanel";

/* -------------------------
    Constants from Schema
------------------------- */

const ALL_ACTIONS = ["READ", "CREATE", "UPDATE", "DELETE", "VOID", "APPROVE", "EXPORT"];
const ALL_RESOURCES = [
  "INVOICE", "STOCK", "PRODUCT", "CUSTOMER", "EXPENSE", 
  "PROCUREMENT", "VENDOR", "REPORT", "AUDIT", "SETTINGS", 
  "BRANCH", "PERSONNEL", "FINANCE"
];

/* -------------------------
    Main Component
------------------------- */

export default function OrganizationWorkspace() {
  const { dispatch } = useAlerts();
  const { openPanel } = useSidePanel();

  const [activeTab, setActiveTab] = useState<"profile" | "uoms" | "taxes" | "preferences" | "permissions">("profile");
  const [isPending, startTransition] = useTransition();

  // State
  const [orgData, setOrgData] = useState<Organization | null>(null);
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [permissions, setPermissions] = useState<ResourcePermission[]>([]);
  
  // UI State for Permissions Tab
  const [expandedResource, setExpandedResource] = useState<string | null>("INVOICE");

  // Theme Sync
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

  const loadData = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/myorg`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load org data");

        setOrgData(data.org);
        setUoms(data.uoms || []);
        setTaxRates(data.taxRates || []);
        setPreferences(data.preferences || []);
        setPermissions(data.permissions || []);
      } catch (err: any) {
        dispatch({ kind: "TOAST", type: "WARNING", title: "Sync Error", message: err.message });
      }
    });
  }, [dispatch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* -------------------------
      Panel Handlers
  ------------------------- */

  const handleOpenUom = (uom?: UnitOfMeasure) => {
    openPanel(
      <UomPanel uom={uom} onRefresh={loadData} />, 
      { title: uom ? `Edit ${uom.name}` : "Register Unit of Measure", isRight: true }
    );
  };

  const handleOpenTax = (tax?: TaxRate) => {
    openPanel(
      <TaxPanel taxRate={tax} onRefresh={loadData} />, 
      { title: tax ? `Edit ${tax.name}` : "Define Tax Rate", isRight: true }
    );
  };

  const handleOpenPermission = (perm?: ResourcePermission) => {
    openPanel(
      <PermissionPanel permission={perm} onRefresh={loadData} />, 
      { title: perm ? "Edit RBAC Rule" : "Define Permission", isRight: true }
    );
  };

  const handleOpenPreference = (pref?: Preference) => {
    openPanel(
      <PreferencePanel preference={pref} onRefresh={loadData} />, 
      { title: pref ? "Edit Global Preference" : "Define Preference", isRight: true }
    );
  };

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

        {/* TAB NAVIGATION */}
        <div className="flex px-4 gap-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-x-auto custom-scrollbar">
          <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={Building2} label="General Profile" />
          <TabButton active={activeTab === "uoms"} onClick={() => setActiveTab("uoms")} icon={Scale} label="Units of Measure" />
          <TabButton active={activeTab === "taxes"} onClick={() => setActiveTab("taxes")} icon={Percent} label="Tax Rates" />
          <TabButton active={activeTab === "permissions"} onClick={() => setActiveTab("permissions")} icon={ShieldCheck} label="Role Permissions" />
          <TabButton active={activeTab === "preferences"} onClick={() => setActiveTab("preferences")} icon={Settings2} label="Global Preferences" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
          
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
            <StatCard title="System Status" value={orgData?.active ? "ACTIVE" : "INACTIVE"} icon={Building2} color="emerald" />
            <StatCard title="Tax Profiles" value={String(taxRates.length)} sub="Fiscal Configurations" icon={Percent} color="amber" />
            <StatCard title="UoMs" value={String(uoms.length)} sub="Active Standards" icon={Scale} color="indigo" />
            <StatCard title="RBAC Rules" value={String(permissions.length)} sub="Access Policies" icon={ShieldCheck} color="blue" />
          </section>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col min-h-[500px] bg-white dark:bg-slate-900 transition-colors shadow-sm mb-10">
            
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
              <TableLayout 
                title="Measurement Standards" 
                buttonLabel="Register UoM" 
                onAdd={() => handleOpenUom()}
              >
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
                          <button onClick={() => handleOpenUom(u)} className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors rounded-md">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableLayout>
            )}

            {/* TAX RATES TAB */}
            {activeTab === "taxes" && (
               <TableLayout 
                 title="Tax Configurations" 
                 buttonLabel="Define Tax Rate" 
                 onAdd={() => handleOpenTax()}
               >
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tax Name</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rate (%)</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {taxRates.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3"><span className="text-[13px] font-bold text-slate-900 dark:text-white">{t.name}</span></td>
                        <td className="px-5 py-3"><span className="text-[12px] font-bold text-slate-600 dark:text-slate-300">{t.rate.toString()}%</span></td>
                        <td className="px-5 py-3">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.type}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => handleOpenTax(t)} className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors rounded-md">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableLayout>
            )}

            {/* PERMISSIONS TAB: RESOURCE-CENTRIC SEGMENTATION */}
            {activeTab === "permissions" && (
               <div className="flex flex-col h-full animate-in fade-in duration-300">
                  <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/30 dark:bg-slate-800/20">
                    <div>
                      <h2 className="text-[15px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-500" />
                        Access Matrix
                      </h2>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">Define capabilities by system module</p>
                    </div>
                    <button onClick={() => handleOpenPermission()} className="flex h-9 px-4 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-indigo-700 transition-all items-center gap-2 shadow-sm">
                      <Plus className="w-3.5 h-3.5" /> Define Permission
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    {ALL_RESOURCES.map((resource) => {
                      const resourceRules = permissions.filter(p => p.resource === resource);
                      const isExpanded = expandedResource === resource;

                      return (
                        <div 
                          key={resource} 
                          className={`border rounded-xl transition-all duration-200 overflow-hidden ${
                            isExpanded 
                              ? 'border-indigo-200 dark:border-indigo-500/30 ring-1 ring-indigo-50 dark:ring-indigo-500/10' 
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {/* Resource Header */}
                          <button 
                            onClick={() => setExpandedResource(isExpanded ? null : resource)}
                            className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${
                              isExpanded ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                <Settings2 className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-wide uppercase">{resource}</span>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{resourceRules.length} Active Rules</p>
                              </div>
                            </div>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </button>

                          {/* Matrix Content */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-x-auto">
                              {resourceRules.length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                                      <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-48">Target Role</th>
                                      {ALL_ACTIONS.map(action => (
                                        <th key={action} className="px-2 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{action}</th>
                                      ))}
                                      <th className="w-16"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {resourceRules.map(p => (
                                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group transition-colors">
                                        <td className="px-5 py-3">
                                          <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                                            {p.role}
                                          </span>
                                        </td>
                                        {ALL_ACTIONS.map(action => {
                                          const hasAction = p.actions.includes(action as any);
                                          return (
                                            <td key={action} className="px-2 py-3 text-center">
                                              {hasAction ? (
                                                <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600">
                                                  <Check className="w-3 h-3" />
                                                </div>
                                              ) : (
                                                <Minus className="w-3 h-3 text-slate-200 dark:text-slate-800 mx-auto" />
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="px-5 py-3 text-right">
                                          <button 
                                            onClick={() => handleOpenPermission(p)} 
                                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 transition-all rounded-md"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-800/20">
                                  <Shield className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">No custom rules defined for this module</p>
                                  <button 
                                    onClick={() => handleOpenPermission()}
                                    className="mt-4 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline"
                                  >
                                    + Create Base Rule
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
               </div>
            )}

            {/* PREFERENCES TAB */}
            {activeTab === "preferences" && (
               <TableLayout 
                 title="Global Preferences" 
                 buttonLabel="Define Preference" 
                 onAdd={() => handleOpenPreference()}
               >
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Configuration Key</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scope</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preferences.map(pref => (
                      <tr key={pref.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                            {pref.category}
                          </span>
                        </td>
                        <td className="px-5 py-3"><span className="text-[13px] font-bold text-slate-900 dark:text-white">{pref.key}</span></td>
                        <td className="px-5 py-3">
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-bold uppercase">{pref.scope}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => handleOpenPreference(pref)} className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-400 hover:text-indigo-600 transition-colors rounded-md">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableLayout>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

/* -------------------------
    UI Atoms
------------------------- */

function TableLayout({ title, buttonLabel, onAdd, children }: any) {
  return (
    <div className="flex flex-col h-full animate-in fade-in duration-200">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
        <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">{title}</h2>
        <button onClick={onAdd} className="flex h-8 px-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-indigo-700 transition-all items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {buttonLabel}
        </button>
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

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
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-100/20",
    indigo: "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-100/20",
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]} flex items-start justify-between shadow-sm transition-transform hover:scale-[1.01]`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">{title}</p>
        <p className="text-xl font-black">{value}</p>
        {sub && <p className="text-[9px] font-bold uppercase tracking-tighter opacity-70 mt-1">{sub}</p>}
      </div>
      <Icon className="w-5 h-5 opacity-40" />
    </div>
  );
}