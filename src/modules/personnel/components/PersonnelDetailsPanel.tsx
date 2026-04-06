"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Types and Enums imported from your module paths
import { Personnel, UpdatePayload, AlertAction, Role } from "./types";
import { PropertyRow } from "./PropertyRow";

// Utilities
import {
  getDepartmentColor,
  getBranchColor,
  generateSecurePassword,
  copyToClipboard
} from "./utils";
import { getInitials } from "@/core/utils";

/* ==========================================================================
   TYPES & INTERFACES
   ========================================================================== */

export interface ActivityLogDTO {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string | Date;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  metadata?: any;
  personnel?: {
    name: string;
    email: string;
  } | null;
  performedBy?: string;
  personnelName?: string;
  details?: string;
}

interface PersonnelDetailsPanelProps {
  personnel: Personnel;
  logs?: ActivityLogDTO[];
  onClose: () => void;
  onUpdate: (id: string, payload: UpdatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  dispatch: (action: AlertAction) => void;
}

const LOG_TABS = {
  ALL: "ALL_ACTIONS",
  SECURITY: "SECURITY",
  PROVISION: "PROVISION",
  UPDATE: "UPDATE",
} as const;

type FormState = {
  name: string;
  role: Role;
};

/* ==========================================================================
   LOCAL UTILS
   ========================================================================== */

const parseDevice = (ua?: string | null) => {
  if (!ua) return "System Process";
  const lowUA = ua.toLowerCase();
  if (lowUA.includes("windows")) return "Windows PC";
  if (lowUA.includes("iphone") || lowUA.includes("ipad")) return "iOS Device";
  if (lowUA.includes("android")) return "Android";
  if (lowUA.includes("macintosh")) return "MacBook / iMac";
  if (lowUA.includes("postman") || lowUA.includes("curl")) return "API/Dev Tool";
  return ua.split(" ")[0] || "Unknown Device";
};

/* ==========================================================================
   SUB-COMPONENT: COMPACT ACTIVITY CARD
   ========================================================================== */

const ActivityCard = ({ log, onToast }: { log: ActivityLogDTO; onToast: (a: AlertAction) => void }) => {
  const [expanded, setExpanded] = useState(false);

  // Logic: Performer Name -> Initials (Fallback to "System Authority" for System)
  const performerName = log.personnel?.name ?? log.performedBy ?? log.personnelName ?? "System Authority";

  const dateStr = (() => {
    try {
      return new Date(log.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(log.createdAt);
    }
  })();

  const action = (log.action || "").toUpperCase();
  const isRed = /DELETE|DEACTIVATED|REJECTED|REMOVE|TERMINATE|PURGE/.test(action);
  const isAmber = /DISABLED|LOCKED|WARN|BLOCK|SUSPENDED/.test(action);

  const getTheme = () => {
    if (isRed) return { dot: "bg-red-500 ring-red-100", text: "text-red-600", bg: "bg-red-50" };
    if (isAmber) return { dot: "bg-amber-500 ring-amber-100", text: "text-amber-600", bg: "bg-amber-50" };
    return { dot: "bg-slate-400 ring-slate-100", text: "text-slate-600", bg: "bg-slate-100" };
  };

  const theme = getTheme();

  const handleCopyMeta = async () => {
    const payload = JSON.stringify(
      {
        ip: log.ipAddress || "Internal",
        ua: parseDevice(log.deviceInfo),
        meta: log.metadata || {},
      },
      null,
      2
    );
    await copyToClipboard(payload, onToast);
  };

  return (
    <div className="relative group">
      {/* Timeline Dot */}
      <span className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border-2 border-white ring-2 ${theme.dot}`} />

      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col min-w-0 bg-white border border-slate-100 rounded-lg p-3 hover:shadow-sm transition-all"
      >
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">
              {performerName}
            </span>
            <span className={`text-[8px] font-bold uppercase mt-0.5 px-1.5 py-0.5 rounded w-fit tracking-wider ${theme.bg} ${theme.text}`}>
              {log.action.replace(/_/g, " ")}
            </span>
          </div>
          <span className="text-[9px] font-medium text-slate-400 whitespace-nowrap shrink-0">
            {dateStr}
          </span>
        </div>

        <p className="text-[11px] font-medium text-slate-600 leading-snug break-words">
          {log.details || (log.metadata as any)?.details || "Audit sequence completed successfully."}
        </p>

        {(log.metadata || log.ipAddress) && (
          <div className="mt-2 flex flex-col min-w-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 w-fit transition-colors"
            >
              {expanded ? "Hide Payload" : "View Payload"}
              <i className={`bx bx-chevron-${expanded ? "up" : "down"}`} />
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-1.5"
                >
                  <div className="p-2 bg-slate-900 rounded-md relative min-w-0 group/code">
                    <button
                      onClick={handleCopyMeta}
                      className="absolute right-1 top-1 p-1 bg-white/10 hover:bg-white/20 rounded text-slate-300 opacity-0 group-hover/code:opacity-100 transition-all"
                      title="Copy Payload"
                    >
                      <i className="bx bx-copy text-[10px]" />
                    </button>
                    <pre className="text-[9px] font-mono text-emerald-400 leading-relaxed overflow-x-auto custom-scrollbar w-full whitespace-pre-wrap break-words">
                      {JSON.stringify(
                        {
                          ip: log.ipAddress || "Internal",
                          ua: parseDevice(log.deviceInfo),
                          meta: log.metadata || {},
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
};

/* ==========================================================================
   MAIN PANEL COMPONENT
   ========================================================================== */

export function PersonnelDetailsPanel({
  personnel,
  logs = [],
  onClose,
  onUpdate,
  onDelete,
  dispatch
}: PersonnelDetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(true);
  const [logFilter, setLogFilter] = useState<string>(LOG_TABS.ALL);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [fetchingTemp, setFetchingTemp] = useState(false);
  const [rotationEvent, setRotationEvent] = useState<{ time: Date; key: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    name: personnel.name || "",
    role: personnel.role,
  });

  const isActive = !personnel.disabled && !personnel.isLocked;
  const isOrgOwner = (personnel as any).isOrgOwner === true;
  const requiresPasswordChange = (personnel as any).requiresPasswordChange === true;

  /**
   * MASA Protocol: Vault Sync (Backend Persistence Retrieval)
   */
  const fetchTempCredential = useCallback(async () => {
    if (!requiresPasswordChange) {
      setTempPassword(null);
      return;
    }

    setFetchingTemp(true);
    try {
      const res = await fetch(
        `/api/preferences?category=SYSTEM&key=TEMP_CREDENTIAL&target=${encodeURIComponent(personnel.email)}`
      );
      const data = await res.json();
      if (res.ok && data && (data.preference || data.value)) {
        setTempPassword(data.preference ?? data.value);
      } else {
        setTempPassword(null);
      }
    } catch (err) {
      console.error("Vault link failed:", err);
      setTempPassword(null);
    } finally {
      setFetchingTemp(false);
    }
  }, [personnel.email, requiresPasswordChange]);

  useEffect(() => {
    fetchTempCredential();
  }, [fetchTempCredential]);

  /**
   * MASA Protocol: Secure Rotation -> Vault-First Write Strategy
   */
  const handleResetPassword = async () => {
    const confirmMsg = !requiresPasswordChange
      ? `Force password change for ${personnel.name}?`
      : `Generate a new temporary password? The existing one will be overwritten in the vault.`;
    if (!confirm(confirmMsg)) return;

    setFetchingTemp(true);
    const newPass = generateSecurePassword();

    try {
      // 1. Persist safely in remote Vault cache/DB First
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "SYSTEM",
          key: "TEMP_CREDENTIAL",
          value: newPass,
          scope: "USER",
          target: personnel.email,
          isLocked: true,
        }),
      });

      if (!res.ok) throw new Error("Vault persist failed");

      // 2. Update Core DB identity (Activation)
      await onUpdate(personnel.id, {
        newPassword: newPass, // If backend natively consumes this
        requiresPasswordChange: true,
      } as any);

      // 3. Sync UI State
      setTempPassword(newPass);
      setRotationEvent({ time: new Date(), key: newPass });
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Key Rotated", message: "New temporary credential vaulted and active." });
    } catch (err) {
      console.error("Rotation error:", err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Rotation Failed", message: "Could not sync credential to secure vault." });
    } finally {
      setFetchingTemp(false);
    }
  };

  const handleSave = async () => {
    try {
      await onUpdate(personnel.id, form as unknown as UpdatePayload);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Protocol Synced", message: "Personnel records updated." });
      setIsEditing(false);
    } catch (e: unknown) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Sync Failed", message: "Update rejected by server." });
    }
  };

  const toggleSecurity = async (key: keyof UpdatePayload, val: boolean) => {
    try {
      const payload: UpdatePayload = { [key]: val } as any;
      if (key === "isLocked" && val) {
        payload.lockReason = prompt("Security lock reason:") || "Administratively locked";
      }
      await onUpdate(personnel.id, payload);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Security Updated", message: "Status modified." });
    } catch (e: unknown) {
      console.error("toggleSecurity error:", e);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: "Could not update security status." });
    }
  };

  const handlePurge = async () => {
    if (!confirm(`Purge ${personnel.name} from registry? This action is irreversible.`)) return;

    try {
      await onDelete(personnel.id);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Purged", message: `${personnel.name} removed from registry.` });
      onClose();
    } catch (err) {
      console.error("Purge failed:", err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Purge Failed", message: "Could not remove account." });
    }
  };

  // Automated log generation and filtering
  const displayLogs = useMemo(() => {
    const sourceLogs: ActivityLogDTO[] = [...(logs || [])];

    // Synthetic Provisioning Log
    if (sourceLogs.length === 0) {
      sourceLogs.push({
        id: "synth-prov",
        action: "PROVISION",
        critical: false,
        createdAt: (personnel as any).createdAt || new Date(),
        details: "Account identity initially provisioned in the global registry.",
      });
      if (personnel.lastActivityAt) {
        sourceLogs.push({
          id: "synth-sync",
          action: "ACCESS",
          critical: false,
          createdAt: personnel.lastActivityAt,
          details: "Last known system handshake recorded.",
        });
      }
    }

    // Synthetic Rotation Log
    if (rotationEvent) {
      sourceLogs.unshift({
        id: "synth-rot",
        action: "UPDATE",
        critical: true,
        createdAt: rotationEvent.time,
        details: "Temporary credential rotated and successfully written to system vault.",
      });
    }

    // Applying Filter
    if (logFilter === LOG_TABS.ALL) {
      return sourceLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const filtered = sourceLogs.filter((l) => {
      const action = (l.action || "").toUpperCase();
      if (logFilter === LOG_TABS.SECURITY) return /LOCK|ACCESS|LOGIN|PASSWORD|AUTH|SECURITY/.test(action);
      if (logFilter === LOG_TABS.PROVISION) return /CREATE|ASSIGN|DELETE|PROVISION/.test(action);
      if (logFilter === LOG_TABS.UPDATE) return /UPDATE|PATCH|EDIT|ENABLE|DISABLE|STOCK_ADJUST/.test(action);
      return action.includes(logFilter);
    });

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs, logFilter, rotationEvent, personnel]);

  return (
    <div className="h-full flex flex-col w-[340px] bg-white relative font-sans shadow-[-10px_0_40px_rgba(0,0,0,0.04)] border-l border-slate-100">
      {/* --- Inspector Header --- */}
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <i className="bx bx-shield-quarter text-sm text-indigo-500" /> Personnel Inspector
        </div>

        <div className="flex gap-1">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
              title="Edit Profile"
            >
              <i className="bx bx-edit-alt text-base" />
            </button>
          )}

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-all active:scale-90"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-12">
        {/* --- Identity Block --- */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="w-16 h-16 shrink-0 rounded-[1.25rem] bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-slate-200">
              {getInitials(personnel.name)}
            </div>

            {isOrgOwner && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 border-2 border-white rounded-full flex items-center justify-center text-white shadow-sm">
                <i className="bx bxs-crown text-[10px]" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-lg font-bold text-slate-900 bg-slate-50 px-2 py-1 rounded-md outline-none border border-indigo-600/20 focus:border-indigo-600 transition-all"
              />
            ) : (
              <h3 className="text-xl font-black text-slate-900 leading-tight truncate tracking-tight">{personnel.name}</h3>
            )}

            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[12px] font-medium text-slate-400 truncate lowercase">{personnel.email}</p>
              <button onClick={() => copyToClipboard(personnel.email, dispatch)} className="text-slate-300 hover:text-indigo-500 transition-colors">
                <i className="bx bx-copy text-xs" />
              </button>
            </div>
          </div>
        </div>

        {/* --- Primary Details --- */}
        <div className="space-y-4 border-t border-black/[0.03] pt-6">
          <PropertyRow
            icon="bx bx-pulse"
            label="Integrity State"
            value={
              <div className={`flex items-center gap-2 px-2 py-1 rounded-md border text-[10px] font-black uppercase w-fit ${
                isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
              }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {isActive ? "Clear & Active" : personnel.isLocked ? "Locked" : "Disabled"}
              </div>
            }
          />

          <PropertyRow
            icon="bx bx-folder"
            label="Branch Registry"
            value={
              <div className="flex flex-col gap-1.5 w-full">
                {personnel.branchAssignments?.length > 0 ? (
                  personnel.branchAssignments.map((assignment) => (
                    <div
                      key={assignment.branchId}
                      className={`flex items-center gap-2 px-2.5 py-1 rounded-md border border-black/[0.04] text-[12px] font-medium truncate w-fit ${getBranchColor(assignment.isPrimary)} ${assignment.isPrimary ? 'bg-slate-50' : 'bg-transparent'}`}
                    >
                      <span className={`w-2 h-2 shrink-0 rounded-full ${getDepartmentColor(assignment.branch.name)}`} />
                      <span className="truncate">{assignment.branch.name} {assignment.isPrimary && <span className="text-[10px] text-slate-400 ml-1">(Primary)</span>}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 bg-slate-50 w-fit px-2.5 py-1 rounded-md border border-black/[0.04] truncate">
                    <span className={`w-2 h-2 shrink-0 rounded-full ${getDepartmentColor(personnel.branch?.name || "Unassigned")}`} />
                    <span className="text-[12px] font-medium text-slate-700 truncate">{personnel.branch?.name || "Global / Unassigned"}</span>
                  </div>
                )}
              </div>
            }
          />

          <PropertyRow
            icon="bx bx-fingerprint"
            label="Staff Code"
            value={
              <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded border border-black/[0.03]">
                {personnel.staffCode || "SYS-PROVISIONED"}
              </span>
            }
          />

          <PropertyRow
            icon="bx bx-briefcase"
            label="System Role"
            value={
              isEditing ? (
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="text-[11px] font-black text-slate-700 bg-slate-50 px-2 py-1.5 rounded-md border border-black/5 w-full outline-none"
                >
                  {Object.values(Role).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <span className="text-[11px] font-black text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md uppercase tracking-wider">
                  {personnel.role}
                </span>
              )
            }
          />

          {/* Credential Rotation UI */}
          <PropertyRow
            icon="bx bx-key"
            label={requiresPasswordChange ? "Vault Credential" : "Security State"}
            value={
              fetchingTemp ? (
                <i className="bx bx-loader-alt animate-spin text-slate-400" />
              ) : tempPassword ? (
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <span className="font-mono text-[11px] font-black text-amber-700 tracking-wider">{tempPassword}</span>
                    <button onClick={() => copyToClipboard(tempPassword, dispatch)} className="text-amber-500 hover:text-amber-700">
                      <i className="bx bx-copy text-xs" />
                    </button>
                  </div>

                  <button
                    onClick={handleResetPassword}
                    className="ml-1 w-6 h-6 flex items-center justify-center rounded-md transition-all active:scale-90 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                    title="Regenerate Key"
                  >
                    <i className="bx bx-refresh text-lg" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleResetPassword}
                  className="text-[10px] font-bold uppercase flex items-center gap-1 group text-blue-500 hover:text-blue-700"
                >
                  <i className="bx bx-reset transition-transform duration-500 group-hover:rotate-180" />
                  {requiresPasswordChange ? "Generate New" : "Rotate Key"}
                </button>
              )
            }
          />
        </div>

        {/* --- Action Suite --- */}
        <div className="pt-6 border-t border-black/[0.03]">
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 py-3 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-[0.98]"
              >
                Commit Context
              </button>

              <button
                onClick={() => {
                  setIsEditing(false);
                  setForm({ name: personnel.name || "", role: personnel.role });
                }}
                className="flex-1 py-3 bg-white text-slate-500 text-[11px] font-black uppercase tracking-widest rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Discard
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Security Interventions</h4>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleSecurity("isLocked", !personnel.isLocked)}
                    className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${
                      personnel.isLocked ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100"
                    }`}
                  >
                    <i className={`bx ${personnel.isLocked ? "bx-lock-open" : "bx-lock-alt"} text-base`} />
                    {personnel.isLocked ? "Unlock" : "Lock"}
                  </button>

                  <button
                    onClick={() => toggleSecurity("disabled", !personnel.disabled)}
                    className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${
                      personnel.disabled ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200 hover:bg-slate-800" : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100"
                    }`}
                  >
                    <i className={`bx ${personnel.disabled ? "bx-user-check" : "bx-user-x"} text-base`} />
                    {personnel.disabled ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Collapsible Activity Log (Redesigned) --- */}
        <div className="pt-6 border-t border-black/[0.03]">
          <button
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl group transition-all border border-black/[0.01]"
          >
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical Telemetry</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-300 font-mono">{displayLogs.length} Events</span>
              <i className={`bx bx-chevron-down text-lg text-slate-400 transition-transform duration-300 ${isLogExpanded ? "rotate-180" : ""}`} />
            </div>
          </button>

          {isLogExpanded && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2">
              {/* Log Filters */}
              <div className="flex gap-1 p-1 bg-slate-50 rounded-lg border border-black/[0.02] mb-5">
                {Object.entries(LOG_TABS).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setLogFilter(value)}
                    className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-md transition-all ${
                      logFilter === value ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {/* Seamless Log Timeline */}
              <div className="px-2">
                <div className="border-l-2 border-slate-100 pl-4 space-y-4">
                  
                  {/* System Level Events */}
                  {rotationEvent && (
                    <div className="relative">
                      <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-amber-500 border-2 border-white ring-4 ring-amber-50" />
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Credential Rotated</p>
                      <p className="text-[9px] text-slate-400">Vault entry synchronized at {rotationEvent.time.toLocaleTimeString()}</p>
                    </div>
                  )}

                  <div className="relative">
                    <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-slate-300 border-2 border-white" />
                    <p className="text-[10px] font-bold text-slate-800 uppercase tracking-tight">Account Provisioned</p>
                    <p className="text-[9px] text-slate-400">Registry entry: {(personnel as any).createdAt ? new Date((personnel as any).createdAt).toLocaleString() : "Initial deployment"}</p>
                  </div>

                  {personnel.lastActivityAt && (
                    <div className="relative">
                      <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white ring-4 ring-indigo-50" />
                      <p className="text-[10px] font-bold text-slate-800 uppercase tracking-tight">Last Registry Sync</p>
                      <p className="text-[9px] text-slate-400">
                        {new Date(personnel.lastActivityAt).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {/* Render computed/filtered logs via Redesigned ActivityCard */}
                  <div className="space-y-4 pt-4 relative">
                    {displayLogs.map((log) => (
                      <ActivityCard key={log.id} log={log} onToast={(a) => dispatch(a)} />
                    ))}
                    {displayLogs.length === 0 && (
                      <div className="text-[10px] text-slate-400 font-medium italic text-center py-4">No events found for this filter.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Danger Zone --- */}
        {!isEditing && (
          <div className="pt-8 border-t border-red-50 mt-8">
            <button
              onClick={handlePurge}
              className="w-full flex items-center justify-center gap-2 px-3 py-4 text-[10px] font-black uppercase tracking-[0.2em] border rounded-2xl transition-all group border-red-100 text-red-500 bg-red-50/50 hover:bg-red-500 hover:text-white"
            >
              <i className="bx bx-trash text-lg group-hover:animate-bounce" /> Purge Account Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}