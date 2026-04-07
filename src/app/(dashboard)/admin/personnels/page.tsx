"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";
import { ActivityLog } from "@prisma/client";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

import { Personnel, Branch, SummaryStats, PaginatedResponse, ProvisionPayload, UpdatePayload } from "@/modules/personnel/components/types";
import { PersonnelDetailsPanel } from "@/modules/personnel/components/PersonnelDetailsPanel";
import { ProvisionPanel } from "@/modules/personnel/components/ProvisionPanel";
import { PersonnelRow } from "@/modules/personnel/components/PersonnelRow";

export default function PersonnelManagementPage() {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const { openPanel, resetToDefault, isOpen } = useSidePanel();

  const userRole = session?.user?.role;
  const isOrgOwner = session?.user?.isOrgOwner;

  const hasFullClearance = isOrgOwner || userRole === "ADMIN" || userRole === "DEV";
  const canProvision = hasFullClearance;
  const canDelete = hasFullClearance;

  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ total: 0, active: 0, disabled: 0, locked: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClosePanel = useCallback(() => {
    resetToDefault();
    setSelectedPersonId(null);
  }, [resetToDefault]);

  const fetchPersonnel = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(`/api/personnels?search=${encodeURIComponent(searchTerm)}&status=${filterStatus}`, {
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error("Sync Failed");
      const json: PaginatedResponse = await res.json();
      setPersonnelList(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, disabled: 0, locked: 0 });
      setBranches(json.branchSummaries || []);
      setLogs(json.recentLogs || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Unable to load data." });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, filterStatus, dispatch]);

  useEffect(() => {
    const delay = setTimeout(() => fetchPersonnel(), 300);
    return () => {
      clearTimeout(delay);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchPersonnel]);

  const handleCreate = async (payload: ProvisionPayload) => {
    if (!canProvision) return;
    const res = await fetch("/api/personnels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to provision");
    await fetchPersonnel();
  };

  const handleUpdate = async (id: string, payload: UpdatePayload) => {
    const originalList = [...personnelList];
    setPersonnelList((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
    try {
      const res = await fetch("/api/personnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");
      await fetchPersonnel();
      const updatedPerson = { ...personnelList.find((p) => p.id === id), ...data };
      if (isOpen && selectedPersonId === id) {
        openPanel(
          <PersonnelDetailsPanel
            personnel={updatedPerson}
            onClose={handleClosePanel}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            dispatch={dispatch}
          />
        );
      }
    } catch (err: unknown) {
      setPersonnelList(originalList);
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Update Failed",
        message: err instanceof Error ? err.message : "Persistence failed.",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Access Denied", message: "You do not have clearance to delete personnel." });
      return;
    }

    if (!confirm("Are you absolutely sure you want to delete this account? This action will softly deactivate it.")) return;
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to deactivate account");
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Deactivated", message: "Personnel record soft-deleted successfully." });
      handleClosePanel();
      await fetchPersonnel();
    } catch (error: unknown) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Action Failed",
        message: error instanceof Error ? error.message : "Deletion failed.",
      });
    }
  };

  const handleOpenDetails = (person: Personnel) => {
    setSelectedPersonId(person.id);
    openPanel(
      <PersonnelDetailsPanel
        personnel={person}
        onClose={handleClosePanel}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        dispatch={dispatch}
      />
    );
  };

  const handleOpenProvision = () => {
    if (!canProvision) return;
    setSelectedPersonId(null);
    openPanel(<ProvisionPanel branches={branches} onClose={handleClosePanel} onCreate={handleCreate} dispatch={dispatch} />);
  };


  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0 overflow-hidden">
      <header className="px-4 py-4 shrink-0 border-b border-black/[0.04] bg-white sticky top-0 z-[100] backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="px-2 min-w-0 flex-1">
            <h1
              className="block w-full truncate text-[14px] sm:text-[15px] md:text-[18px] lg:text-2xl font-semibold tracking-tight text-slate-900 leading-tight"
              title="Personnel Operations"
            >
              Personnel Operations
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:relative sm:block">
              <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="SEARCH_PERSONNEL..."
                className="bg-slate-100 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-40 md:w-64 rounded-lg focus:ring-1 focus:ring-black transition-all outline-none"
              />
            </div>

            {canProvision && (
              <button
                onClick={handleOpenProvision}
                className="p-2 md:px-4 md:py-2 bg-blue-600 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <i className="bx bx-plus text-base md:text-sm" />
                <span className="hidden md:inline">Provision</span>
              </button>
            )}

            <button
              onClick={() => fetchPersonnel()}
              className="p-2 md:px-2 md:py-2 text-[12px] font-semibold border rounded-lg transition-colors flex justify-items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 shadow-sm"
            >
              <i className={`bx bx-refresh text-base md:text-sm ${isLoading ? "bx-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div
          aria-label="status filters"
          className="flex items-center justify-between md:justify-start gap-2 sm:gap-4 md:gap-6 mt-1 pt-4 border-t border-black/5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {[
            { key: "all", label: "TOTAL", count: summary.total, color: "text-slate-400" },
            { key: "active", label: "ACTIVE", count: summary.active, color: "text-emerald-500" },
            { key: "disabled", label: "DISABLED", count: summary.disabled, color: "text-slate-400" },
            { key: "locked", label: "LOCKED", count: summary.locked, color: "text-amber-500" },
          ].map((s, idx) => (
            <React.Fragment key={s.key}>
              {idx > 0 && <div className="w-px h-3 bg-black/10 self-center shrink-0" />}
              <button
                onClick={() => {
                  setFilterStatus(s.key);
                  setSearchTerm("");
                }}
                className={`group flex items-baseline gap-1 sm:gap-1.5 transition-all shrink-0 ${
                  filterStatus === s.key ? "text-blue-600 underline underline-offset-[14px] decoration-2" : "text-slate-400 hover:text-blue-600"
                }`}
              >
                <span
                  className={`text-[8px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] ${
                    filterStatus === s.key ? "text-blue-600" : s.color
                  }`}
                >
                  {s.label}
                </span>
                <span className={`text-[8px] md:text-[10px] font-medium tabular-nums ${filterStatus === s.key ? "text-slate-900" : "text-slate-300"}`}>
                  {s.count}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* --- Desktop Table Header --- */}
      <div className="hidden md:flex px-4 md:px-8 py-2 shrink-0 items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white overflow-hidden whitespace-nowrap">
        {/* Staff ID - matches w-[120px] */}
        <div className="w-[120px] shrink-0 truncate">Staff ID</div>

        {/* Personnel Name - matches flex-[1.5] */}
        <div className="flex-[1.5] min-w-[150px] truncate">Personnel Name</div>

        {/* Email Address - matches flex-1 */}
        <div className="flex-1 min-w-[150px] truncate">Email Address</div>

        {/* Role - matches w-[110px] */}
        <div className="w-[110px] shrink-0 truncate">Role</div>

        {/* Primary Branch - matches w-[160px] */}
        <div className="w-[160px] shrink-0 truncate">Primary Branch</div>

        {/* Access/Status - matches w-[90px] */}
        <div className="w-[90px] shrink-0 truncate text-right">Access</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {isLoading && personnelList.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
            <i className="bx bx-loader-alt animate-spin text-3xl text-blue-500" />
          </div>
        ) : personnelList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50 p-6">
            <i className="bx bx-group text-4xl text-black/20" />
            <p className="text-[12px] font-bold tracking-widest uppercase">No Personnel Found</p>
          </div>
        ) : (
          personnelList.map((person) => (
            <PersonnelRow
              key={person.id}
              personnel={person}
              isSelected={selectedPersonId === person.id}
              onClick={() => handleOpenDetails(person)}
            />
          ))
        )}
      </div>
    </div>
  );
}