"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Personnel, UpdatePayload, AlertAction, Role } from "./types";
import { PropertyRow } from "./PropertyRow";

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

interface DetailsPanelProps {
  personnel: Personnel;
  logs?: ActivityLogDTO[]; // Passed down or dynamically fetched
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

/* ==========================================================================
UTILS
========================================================================== */

function getDepartmentColor(name?: string): string {
  if (!name) return "bg-slate-300";
  const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];
  return colors[Math.abs(hash) % colors.length];
}

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

const getInitials = (name?: string) => {
  if (!name) return "SY";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/[^A-Za-z]/g, ""));
  if (parts.length === 0) return "SY";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const copyToClipboard = async (text: string) => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("Clipboard API unavailable");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  }
};

/* ==========================================================================
SUB-COMPONENT: ACTIVITY CARD
========================================================================== */

const ActivityCard = ({ log, onToast }: { log: ActivityLogDTO; onToast?: (a: AlertAction) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const performerName = log.personnel?.name ?? log.performedBy ?? log.personnelName ?? "System Authority";
  const targetName = (log.metadata as any)?.targetName ?? "General Context";
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

  const getStatusStyles = () => {
    if (isRed) return { badge: "bg-red-50 text-red-600 border-red-100", avatar: "bg-red-600" };
    if (isAmber) return { badge: "bg-amber-50 text-amber-600 border-amber-100", avatar: "bg-amber-500" };
    return { badge: "bg-slate-50 text-slate-500 border-slate-100", avatar: "bg-slate-900" };
  };

  const styles = getStatusStyles();

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
    const ok = await copyToClipboard(payload);
    if (onToast) {
      onToast({
        kind: "TOAST",
        type: ok ? "SUCCESS" : "ERROR",
        title: ok ? "Copied" : "Copy Failed",
        message: ok ? "Payload copied to clipboard." : "Please manually copy the value.",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-3 bg-white border border-black/[0.04] rounded-xl transition-all shadow-sm hover:shadow-md"
    >
      <div className="flex items-center gap-2.5 mb-2.5 min-w-0">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0 shadow-sm ${styles.avatar}`}
        >
          {getInitials(performerName)}
        </div>

        <div className="flex flex-col truncate">
          <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight leading-none whitespace-nowrap mb-1">
            {performerName}
          </span>

          <div className="flex">
            <span
              className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded border tracking-[0.05em] ${styles.badge}`}
            >
              {log.action.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      <div className="pl-9.5 space-y-2">
        <p className="text-[10px] font-medium text-slate-600 leading-snug">
          {log.details || (log.metadata as any)?.details || "Audit sequence completed successfully."}
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[8px] font-black text-slate-400 hover:text-slate-900 flex items-center gap-1 uppercase tracking-widest transition-colors"
        >
          {expanded ? "Collapse_Data" : "Inspect_Payload"}
          <i className={`bx bx-chevron-${expanded ? "up" : "down"} text-xs`} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 relative">
                <div className="p-2.5 bg-slate-900 rounded-lg border border-white/5 relative">
                  <button
                    onClick={handleCopyMeta}
                    className="absolute right-2 top-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-emerald-400 transition-colors"
                  >
                    <i className="bx bx-copy text-[10px]" />
                  </button>

                  <pre className="text-[9px] font-mono text-emerald-400/90 leading-tight overflow-x-auto custom-scrollbar">
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 pt-2.5 border-t border-black/[0.03] flex justify-between items-center">
        <p className="text-[8px] font-bold text-slate-400 font-mono tracking-tight uppercase">{dateStr}</p>
      </div>
    </motion.div>
  );
};

/* ==========================================================================
MAIN PANEL COMPONENT
========================================================================== */

type FormState = {
  name: string;
  role: Role;
};

export function DetailsPanel({ personnel, logs = [], onClose, onUpdate, onDelete, dispatch }: DetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(true); // Default to expanded
  const [logFilter] = useState<string>(LOG_TABS.ALL);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [fetchingTemp, setFetchingTemp] = useState(false);
  const [rotationEvent, setRotationEvent] = useState<{ time: Date; key: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    name: personnel.name || "",
    role: personnel.role,
  });

  const isActive = !personnel.disabled && !personnel.isLocked;

  /**
   * MASA Protocol: Vault Sync (Backend Persistence)
   * Fetches from exact GET /api/preferences endpoint payload structure
   */
  const fetchTempCredential = useCallback(async () => {
    if (!personnel.requiresPasswordChange) {
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
  }, [personnel.email, personnel.requiresPasswordChange]);

  useEffect(() => {
    fetchTempCredential();
  }, [fetchTempCredential]);

  const handleCopy = async (text: string, label: string) => {
    try {
      const ok = await copyToClipboard(text);
      if (ok) {
        dispatch({ kind: "TOAST", type: "SUCCESS", title: "Copied", message: `${label} saved to clipboard.` });
      } else {
        throw new Error("Fallback copy failed");
      }
    } catch {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Copy Failed", message: "Please manually copy the value." });
    }
  };

  /**
   * MASA Protocol: Secure Rotation -> Backend Persist
   */
  const handleResetPassword = async () => {
    const confirmMsg = !personnel.requiresPasswordChange
      ? `Force password change for ${personnel.name}?`
      : `Generate a new temporary password? The existing one will be overwritten in the vault.`;
    if (!confirm(confirmMsg)) return;

    setFetchingTemp(true);
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let newPass = "";
    for (let i = 0; i < 12; i++) newPass += charset[Math.floor(Math.random() * charset.length)];

    try {
      // 1. Update Core DB identity
      await onUpdate(personnel.id, {
        newPassword: newPass,
        requiresPasswordChange: true,
      } as any);

      // 2. Persist safely in remote Preferences cache/DB (Not Local Storage)
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

      if (!res.ok) {
        throw new Error("Vault persist failed");
      }

      setTempPassword(newPass);
      setRotationEvent({ time: new Date(), key: newPass });
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Key Rotated", message: "New temporary credential vaulted and active." });
    } catch (err) {
      console.error("Rotation error:", err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Rotation Failed", message: "Could not sync credential to vault." });
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
    if (!confirm(`Purge ${personnel.name} from registry?`)) return;
    try {
      await onDelete(personnel.id);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Purged", message: `${personnel.name} removed from registry.` });
      onClose();
    } catch (err) {
      console.error("Purge failed:", err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Purge Failed", message: "Could not remove account." });
    }
  };

  // Automated log generation if API doesn't pass strict logs array
  const displayLogs = useMemo(() => {
    const sourceLogs: ActivityLogDTO[] = [...(logs || [])];

    // Auto-generate synthetic telemetry if blank to guarantee UI robustness
    if (sourceLogs.length === 0) {
      sourceLogs.push({
        id: "synth-prov",
        action: "PROVISION",
        critical: false,
        createdAt: (personnel as any).createdAt || new Date(),
        details: "Account identity initially provisioned in the global registry.",
      });
      if ((personnel as any).lastActivityAt) {
        sourceLogs.push({
          id: "synth-sync",
          action: "ACCESS",
          critical: false,
          createdAt: (personnel as any).lastActivityAt,
          details: "Last known system handshake recorded.",
        });
      }
    }

    if (rotationEvent) {
      sourceLogs.unshift({
        id: "synth-rot",
        action: "UPDATE",
        critical: true,
        createdAt: rotationEvent.time,
        details: "Temporary credential rotated and successfully written to system vault.",
      });
    }

    // Apply Filter Tab Logic
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
    <div className="h-full flex flex-col w-[340px] bg-white relative font-sans shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
      {/* --- Inspector Header --- */}
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white/80 backdrop-blur-md shrink-0 z-10">
        <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <i className="bx bx-sidebar text-sm" /> Personnel Inspector
        </div>

        <div className="flex gap-1">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
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

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* --- Identity Block --- */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="w-16 h-16 shrink-0 rounded-[1.25rem] bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-slate-200">
              {personnel.name?.charAt(0) ?? "?"}
            </div>

            {personnel.isOrgOwner && (
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

              <button onClick={() => handleCopy(personnel.email, "Email")} className="text-slate-300 hover:text-indigo-500 transition-colors">
                <i className="bx bx-copy text-xs" />
              </button>
            </div>
          </div>
        </div>

        {/* --- Primary Details --- */}
        <div className="space-y-4 border-t border-black/[0.03] pt-4">
          <PropertyRow
            icon="bx bx-pulse"
            label="Integrity"
            value={
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded-md border text-[10px] font-black uppercase w-fit ${
                  isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {isActive ? "Active" : "Disabled"}
              </div>
            }
          />

          <PropertyRow
            icon="bx bx-folder"
            label="Branch"
            value={
              <div className="flex items-center gap-2 bg-slate-50 w-fit px-2.5 py-1 rounded-md border border-black/[0.04] truncate">
                <span className={`w-2 h-2 shrink-0 rounded-full ${getDepartmentColor(personnel.branch?.name || "Unassigned")}`} />
                <span className="text-[12px] font-medium text-slate-700 truncate">{personnel.branch?.name || "None"}</span>
              </div>
            }
          />

          <PropertyRow
            icon="bx bx-fingerprint"
            label="Staff Code"
            value={
              <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded border border-black/[0.03]">
                {personnel.staffCode || "GUEST-PRMN"}
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
                    <option key={r} value={r}>
                      {r}
                    </option>
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
            label={personnel.requiresPasswordChange ? "Temp Credential" : "Security State"}
            value={
              fetchingTemp ? (
                <i className="bx bx-loader-alt animate-spin text-slate-400" />
              ) : tempPassword ? (
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <span className="font-mono text-[11px] font-black text-amber-700 tracking-wider">{tempPassword}</span>
                    <button onClick={() => handleCopy(tempPassword, "Temporary Password")} className="text-amber-500 hover:text-amber-700">
                      <i className="bx bx-copy text-xs" />
                    </button>
                  </div>

                  <button
                    onClick={handleResetPassword}
                    className="ml-1 w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-all active:scale-90"
                    title="Refresh Credential"
                  >
                    <i className="bx bx-refresh text-lg" />
                  </button>
                </div>
              ) : (
                <button onClick={handleResetPassword} className="text-[10px] font-bold text-blue-500 hover:text-blue-700 uppercase flex items-center gap-1 group">
                  <i className="bx bx-reset group-hover:rotate-180 transition-transform duration-500" />
                  {personnel.requiresPasswordChange ? "Generate New" : "Rotate Key"}
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
                Commit changes
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
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Security Protocol</h4>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleSecurity("isLocked", !personnel.isLocked)}
                    className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${
                      personnel.isLocked ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                    }`}
                  >
                    <i className={`bx ${personnel.isLocked ? "bx-lock-open" : "bx-lock-alt"} text-base`} />
                    {personnel.isLocked ? "Unlock" : "Lock"}
                  </button>

                  <button
                    onClick={() => toggleSecurity("disabled", !personnel.disabled)}
                    className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${
                      personnel.disabled ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200" : "bg-red-50 text-red-600 border-red-100"
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

        {/* --- Collapsible Activity Log (Expanded by default) --- */}
        <div className="pt-6">
          <button
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl group transition-all border border-black/[0.01]"
          >
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical Telemetry</span>
            <i className={`bx bx-chevron-down text-lg transition-transform duration-300 ${isLogExpanded ? "rotate-180" : ""}`} />
          </button>

          {isLogExpanded && (
            <div className="mt-4 space-y-4 px-2 animate-in fade-in slide-in-from-top-2">
              <div className="border-l-2 border-slate-100 pl-4 space-y-5">
                {rotationEvent && (
                  <div className="relative">
                    <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-amber-500 border-2 border-white ring-4 ring-amber-50" />
                    <p className="text-[10px] font-bold text-amber-600 uppercase">Credential Rotated</p>
                    <p className="text-[9px] text-slate-400">Vault entry updated: {rotationEvent.time.toLocaleTimeString()}</p>
                  </div>
                )}

                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-slate-300 border-2 border-white" />
                  <p className="text-[10px] font-bold text-slate-800 uppercase">Account Provisioned</p>
                  <p className="text-[9px] text-slate-400">Registry entry: {new Date(personnel.createdAt).toLocaleString()}</p>
                </div>

                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white" />
                  <p className="text-[10px] font-bold text-slate-800 uppercase">Last Registry Sync</p>
                  <p className="text-[9px] text-slate-400">
                    {personnel.lastActivityAt ? new Date(personnel.lastActivityAt).toLocaleString() : "No telemetry recorded"}
                  </p>
                </div>

                {/* Render computed logs */}
                <div className="space-y-3">
                  {displayLogs.map((log) => (
                    <ActivityCard key={log.id} log={log} onToast={(a) => dispatch(a)} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Danger Zone --- */}
        {!isEditing && (
          <div className="pt-6 border-t border-black/[0.03]">
            <button
              onClick={handlePurge}
              className="w-full flex items-center justify-center gap-2 px-3 py-4 text-[10px] font-black uppercase tracking-[0.2em] border border-red-100 text-red-500 bg-red-50/50 rounded-2xl hover:bg-red-500 hover:text-white transition-all group"
            >
              <i className="bx bx-trash text-lg group-hover:animate-bounce" /> Purge Account Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
