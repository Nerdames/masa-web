"use client";

import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Search, Plus, Eye, Users, Phone, Mail, MapPin, CheckCircle2,
  RefreshCw, ShieldCheck, X, Archive, Edit3, Loader2, Package, Save, AlertCircle
} from "lucide-react";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

/**
 * Types aligned with server payload
 */
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface IVendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  _count?: { purchaseOrders: number; grns: number };
  // Additional computed fields may be present from server (performanceScore etc.)
  performanceScore?: number;
  totalRevenue?: number;
  salesVelocity?: number;
  productsSupplied?: number;
  totalStockValue?: number;
}

interface IActivityLog {
  id: string;
  action: string;
  actorRole?: string | null;
  createdAt: string;
  severity: Severity;
  description: string;
  requestId?: string | null;
  previousHash?: string | null;
  hash?: string | null;
}

interface VendorsResponse {
  summary: { totalVendors: number; totalRevenue: number };
  leaders: { topVendor: IVendor | null; fastestVendor: IVendor | null; bestOverall: IVendor | null };
  vendors: IVendor[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * VendorsWorkspace
 */
export default function VendorsWorkspace({ organizationId }: { organizationId: string }) {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel } = useSidePanel();

  const [vendors, setVendors] = useState<IVendor[]>([]);
  const [logs, setLogs] = useState<IActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<IVendor | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<IVendor | null>(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  // Time-aware theme
  useEffect(() => {
    const applyTheme = () => {
      const hour = new Date().getHours();
      const isNight = hour >= 19 || hour < 7;
      if (isNight) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    applyTheme();
    const id = setInterval(applyTheme, 60000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async (opts?: { page?: number; search?: string }) => {
    startTransition(async () => {
      try {
        const q = new URLSearchParams();
        q.set("limit", String(limit));
        q.set("page", String(opts?.page ?? page));
        if (opts?.search !== undefined) q.set("search", opts.search);
        else if (searchTerm) q.set("search", searchTerm);

        const res = await fetch(`/api/vendors?${q.toString()}`);
        const data: VendorsResponse = await res.json();
        if (!res.ok) throw new Error((data as any).error || "Failed to load vendors");
        setVendors(data.vendors || []);
      } catch (err: any) {
        dispatch({ kind: "TOAST", type: "WARNING", title: "Sync Error", message: err.message || "Failed to load vendors" });
        setVendors([]);
      }
    });
  }, [dispatch, limit, page, searchTerm]);

  const loadLogs = useCallback(async () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/logs?resource=VENDOR&limit=20`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load logs");
        setLogs(data.logs || []);
      } catch (err) {
        console.error("Audit retrieval failed:", err);
        setLogs([]);
      }
    });
  }, []);

  useEffect(() => {
    loadData({ page: 1, search: "" });
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData, loadLogs]);

  // Refresh handler
  const refreshAll = useCallback(() => {
    loadData({ page: 1, search: searchTerm });
    loadLogs();
  }, [loadData, loadLogs, searchTerm]);

  // Archive vendor
  const handleArchive = async (id: string) => {
    const ok = confirm("Are you sure you want to archive this vendor node? This action is immutable and will be recorded in the forensic audit log.");
    if (!ok) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/vendors?id=${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to archive vendor");
        dispatch({ kind: "TOAST", type: "SUCCESS", title: "Vendor Archived", message: "Vendor node archived successfully." });
        setSelectedVendor(null);
        refreshAll();
      } catch (err: any) {
        dispatch({ kind: "TOAST", type: "WARNING", title: "Archive Failed", message: err.message || "Archive failed" });
      }
    });
  };

  // Create / Edit modal submit handled inside modal component (below)

  // Side panel for vendor details (similar to Personnel page)
  const openVendorPanel = (vendor: IVendor) => {
    setSelectedVendor(vendor);
    openPanel(
      <VendorDetailPanel
        vendor={vendor}
        onClose={() => { setSelectedVendor(null); closePanel(); }}
        onEdit={() => { setEditingVendor(vendor); setIsModalOpen(true); }}
        onArchive={() => handleArchive(vendor.id)}
      />
    );
  };

  // Derived stats
  const stats = useMemo(() => {
    const active = vendors.filter(v => !v.deletedAt).length;
    const totalOrders = vendors.reduce((acc, v) => acc + (v._count?.purchaseOrders || 0), 0);
    const topVendor = [...vendors].sort((a, b) => (b._count?.purchaseOrders || 0) - (a._count?.purchaseOrders || 0))[0];
    return { active, totalOrders, topVendorName: topVendor?.name || "N/A" };
  }, [vendors]);

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative overflow-hidden transition-colors duration-300">
      {isPending && (
        <div className="absolute inset-0 flex justify-center items-center bg-white/40 dark:bg-slate-950/40 backdrop-blur-sm z-[200]">
          <Loader2 className="w-12 h-12 text-emerald-600 dark:text-emerald-500 animate-spin" />
        </div>
      )}

      <header className="w-full flex flex-col bg-white dark:bg-slate-900 border-b border-black/[0.04] dark:border-slate-800 shrink-0 sticky top-0 z-[30] transition-colors">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-lg shadow-sm">
              <Users className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-white">Vendor Directory</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter nodes..."
                className="bg-slate-100/80 dark:bg-slate-800/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 lg:w-64 rounded-md focus:ring-1 focus:ring-emerald-500 outline-none dark:text-white transition-colors"
              />
            </div>

            <button onClick={refreshAll} disabled={isPending} className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-emerald-500" : ""}`} />
            </button>

            <button onClick={() => { setEditingVendor(null); setIsModalOpen(true); }} className="flex h-8 px-3 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-emerald-700 transition-all items-center gap-1.5 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Register Node</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col xl:flex-row pb-12">
        <main className="flex-1 px-4 lg:px-6 flex flex-col gap-6">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <StatCard title="Total Registered" value={String(stats.active)} icon={Users} color="emerald" />
            <StatCard title="Active Commitments" value={String(stats.totalOrders)} sub="Aggregated PO Volume" icon={Package} color="blue" />
            <StatCard title="Prime Supplier" value={stats.topVendorName} icon={CheckCircle2} color="amber" />
          </section>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 overflow-hidden shadow-sm transition-colors min-h-[400px]">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Node / ID</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Communication</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Flow Data</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredVendors.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-20 text-center text-slate-400 text-[11px] font-bold uppercase">No records found within directory.</td></tr>
                  ) : filteredVendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span onClick={() => openVendorPanel(vendor)} className="text-[13px] font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">{vendor.name}</span>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5 uppercase tracking-tighter">{vendor.id}</span>
                        </div>
                      </td>

                      <td className="px-5 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                            <Mail className="w-3 h-3 text-slate-400" /> {vendor.email || "—"}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                            <Phone className="w-3 h-3 text-slate-400" /> {vendor.phone || "—"}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex justify-center gap-4">
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-bold text-slate-900 dark:text-white">{vendor._count?.purchaseOrders}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Orders</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-bold text-slate-900 dark:text-white">{vendor._count?.grns}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">GRNs</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${!vendor.deletedAt ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
                          {!vendor.deletedAt ? "ACTIVE" : "ARCHIVED"}
                        </span>
                      </td>

                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openVendorPanel(vendor)} className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 transition-colors" title="Node Details">
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {!vendor.deletedAt && (
                            <button onClick={() => { setEditingVendor(vendor); setIsModalOpen(true); }} className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition-colors" title="Update Profile">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <aside className="w-full xl:w-[320px] flex-shrink-0 mt-6 xl:mt-0 xl:border-l xl:border-slate-200/60 dark:border-slate-800 px-4 xl:px-0">
          <div className="bg-white dark:bg-slate-900 p-5 xl:rounded-none rounded-xl border xl:border-none border-slate-200/60 dark:border-slate-800 lg:h-[calc(100vh-56px)] overflow-y-auto custom-scrollbar shadow-sm xl:shadow-none transition-colors">
            <div className="flex items-center justify-between mb-5 sticky top-0 bg-white dark:bg-slate-900 pb-3 border-b border-slate-100 dark:border-slate-800 z-10 transition-colors">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-500" />
                <h4 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Audit Ledger</h4>
              </div>

              <div className="flex relative h-2 w-2">
                <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
            </div>

            <div className="space-y-4">
              {(!logs || logs.length === 0) ? (
                <p className="text-[10px] font-bold text-slate-400 text-center py-10 uppercase tracking-widest">No recent events</p>
              ) : logs.map((log) => (
                <div key={log.id} className="relative pl-3">
                  <div className="absolute left-0 top-1.5 bottom-[-16px] w-px bg-slate-100 dark:bg-slate-800 last:hidden"></div>

                  <div className={`absolute left-[-3px] top-1.5 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-slate-950 ${
                    log.severity === 'CRITICAL' ? 'bg-red-500' :
                    log.severity === 'HIGH' ? 'bg-orange-500' :
                    log.severity === 'MEDIUM' ? 'bg-blue-500' : 'bg-emerald-500'
                  }`}></div>

                  <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-md p-2.5 border border-slate-100/80 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest leading-none truncate pr-2">
                        {log.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-[8px] text-slate-400 font-mono shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1 leading-snug">{log.description}</p>

                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded tracking-tighter uppercase">
                        {log.actorRole || 'SYSTEM'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <CreateEditVendorModal
          vendor={editingVendor}
          organizationId={organizationId}
          onClose={() => { setIsModalOpen(false); setEditingVendor(null); }}
          onRefresh={() => { refreshAll(); }}
        />
      )}
    </div>
  );
}

/* -------------------------
   Subcomponents
   ------------------------- */

function StatCard({ title, value, sub, icon: Icon, color }: any) {
  const colorMap: any = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400"
  };
  const iconBgMap: any = {
    emerald: "bg-emerald-50 dark:bg-emerald-900/20",
    blue: "bg-blue-50 dark:bg-blue-900/20",
    amber: "bg-amber-50 dark:bg-amber-900/20"
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <div className="flex justify-between items-start">
        <p className={`text-[10px] font-bold ${colorMap[color] || 'text-slate-500'} uppercase tracking-widest`}>{title}</p>
        <div className={`p-1.5 rounded-lg ${iconBgMap[color]}`}>
          <Icon className={`w-3.5 h-3.5 ${colorMap[color]}`} />
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
        {sub && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

function VendorDetailPanel({ vendor, onClose, onEdit, onArchive }: { vendor: IVendor; onClose: () => void; onEdit: () => void; onArchive: () => void; }) {
  return (
    <>
      <div
        className="fixed inset-0 bg-slate-900/20 dark:bg-slate-950/50 backdrop-blur-sm z-[90] transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[380px] bg-white dark:bg-slate-900 shadow-2xl z-[150] flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-100 dark:border-slate-800">
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-black/[0.04] flex items-center justify-between bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-20">
            <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              <i className="bx bx-shield-quarter text-sm text-indigo-500" /> Node Inspector
            </div>

            <div className="flex gap-1">
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-all active:scale-90"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-12">
            <div className="flex items-center gap-5">
              <div className="relative group">
                <div className="w-16 h-16 shrink-0 rounded-[1.25rem] bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center text-2xl font-black shadow-lg">
                  {vendor.name.split(" ").map(s => s[0]).slice(0,2).join("")}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-black text-slate-900 leading-tight truncate tracking-tight">{vendor.name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[12px] font-medium text-slate-400 truncate lowercase">{vendor.email || "—"}</p>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1 uppercase">{vendor.id}</div>
              </div>
            </div>

            <div className="space-y-4 border-t border-black/[0.03] pt-6">
              <div className="grid grid-cols-2 gap-4">
                <ProfileField label="Purchase Orders" value={String(vendor._count?.purchaseOrders || 0)} icon={Package} />
                <ProfileField label="Receipts (GRNs)" value={String(vendor._count?.grns || 0)} icon={CheckCircle2} />
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Node Connectivity</h4>
                <ContactRow icon={Mail} label="Official Email" value={vendor.email || "No email provided"} />
                <ContactRow icon={Phone} label="Primary Contact" value={vendor.phone || "No contact provided"} />
                <ContactRow icon={MapPin} label="Base Location" value={vendor.address || "No address provided"} />
              </div>
            </div>
          </div>

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


function ContactRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 group/row">
      <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
        <Icon className="w-3.5 h-3.5 text-slate-400 group-hover/row:text-emerald-500 transition-colors" />
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</span>
        <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300">{value}</span>
      </div>
    </div>
  );
}

function ProfileField({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-1">
      <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1" />
      <span className="text-sm font-bold text-slate-900 dark:text-white">{value}</span>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

/* -------------------------
   Create / Edit Modal
   ------------------------- */

function CreateEditVendorModal({ vendor, organizationId, onClose, onRefresh }: { vendor: IVendor | null; organizationId: string; onClose: () => void; onRefresh: () => void; }) {
  const { dispatch } = useAlerts();
  const [formData, setFormData] = useState({
    name: vendor?.name || "",
    email: vendor?.email || "",
    phone: vendor?.phone || "",
    address: vendor?.address || ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFormData({
      name: vendor?.name || "",
      email: vendor?.email || "",
      phone: vendor?.phone || "",
      address: vendor?.address || ""
    });
  }, [vendor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: any = { ...formData };
      if (vendor) payload.id = vendor.id;
      const res = await fetch('/api/vendors', {
        method: vendor ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Operation failed.");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: vendor ? "Vendor Updated" : "Vendor Registered", message: `Successfully ${vendor ? 'modified' : 'added'} ${data.name || 'the vendor'}.` });
      onRefresh();
      onClose();
    } catch (err: any) {
      dispatch({ kind: "TOAST", type: "WARNING", title: "Registration Error", message: err.message || "Operation failed" });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-[14px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">{vendor ? 'Update Node Data' : 'Register Vendor Node'}</h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight">MASA Core Directory Persistence</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <form id="vendor-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Legal Name <span className="text-emerald-500">*</span></label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="Apex Logistics Ltd" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Email Connectivity</label>
                <input type="email" value={formData.email || ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="operations@apex.com" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Phone Network</label>
                <input type="tel" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white transition-colors" placeholder="+234..." />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">Operational Base</label>
              <textarea value={formData.address || ""} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium p-2.5 focus:ring-1 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-950 dark:text-white resize-none transition-colors" placeholder="Full street address..." />
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors uppercase tracking-widest">Cancel</button>

          <button type="submit" form="vendor-form" disabled={isSubmitting} className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all uppercase tracking-widest disabled:opacity-70 shadow-md shadow-emerald-500/10">
            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {vendor ? 'Update Registry' : 'Save Node'}
          </button>
        </div>
      </div>
    </div>
  );
}
