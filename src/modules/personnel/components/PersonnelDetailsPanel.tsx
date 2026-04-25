"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import {
  Shield,
  Activity,
  Folder,
  Fingerprint,
  Briefcase,
  Key,
  RefreshCw,
  Edit2,
  X,
  Copy,
  Crown,
  Lock,
  Unlock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  UserCheck,
  UserX,
  Maximize2,
  Minimize2,
  RefreshCw as RefreshIcon,
} from "lucide-react";

// Types and Enums imported from your module paths
import { Personnel, UpdatePayload, AlertAction, Role } from "./types";
import { PropertyRow } from "./PropertyRow";

// Utilities
import {
  getDepartmentColor,
  getBranchColor,
  generateSecurePassword,
  copyToClipboard,
} from "./utils";
import { getInitials } from "@/core/utils";
import { useAlerts } from "@/core/components/feedback/AlertProvider";
import { useSidePanel } from "@/core/components/layout/SidePanelContext";

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
}

type FormState = {
  name: string;
  role: Role;
};

/* ==========================================================================
   MAIN PANEL COMPONENT
   ========================================================================== */

export function PersonnelDetailsPanel({
  personnel,
  onClose,
  onUpdate,
  onDelete,
}: PersonnelDetailsPanelProps) {
  const { dispatch } = useAlerts();
  const { isFullScreen, toggleFullScreen } = useSidePanel();

  const [isEditing, setIsEditing] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(true);
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
    if (!window.confirm(confirmMsg)) return;

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
        newPassword: newPass,
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
    if (!window.confirm(`Purge ${personnel.name} from registry? This action is irreversible.`)) return;
    try {
      await onDelete(personnel.id);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Purged", message: `${personnel.name} removed from registry.` });
      onClose();
    } catch (err) {
      console.error("Purge failed:", err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Purge Failed", message: "Could not remove account." });
    }
  };

  // Calculate static event count for the header
  const eventCount = 1 + (personnel.lastActivityAt ? 1 : 0) + (rotationEvent ? 1 : 0);

  return (
    <div className={`h-full flex flex-col bg-white dark:bg-slate-900 relative font-sans transition-all duration-300 ${isFullScreen ? 'w-full shadow-xl' : 'w-[340px] shadow-[-10px_0_40px_rgba(0,0,0,0.04)] border-l border-slate-100 dark:border-slate-800'}`}>
      {/* --- Inspector Header --- */}
      <div className="p-4 border-b border-black/[0.04] dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-2 px-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          <Shield className="text-sm text-indigo-500 w-4 h-4" /> Personnel Inspector
        </div>

        <div className="flex gap-1 items-center">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-all active:scale-90"
              title="Edit Profile"
            >
              <Edit2 className="text-base w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleFullScreen}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition-all active:scale-90"
            title={isFullScreen ? "Minimize" : "Maximize"}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 flex items-center justify-center text-slate-500 transition-all active:scale-90"
          >
            <X className="text-xl w-5 h-5" />
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-6 custom-scrollbar pb-12 ${isFullScreen ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'space-y-8'}`}>
        
        {/* Left Column in Full Screen / Top Block in Side Panel */}
        <div className="space-y-8">
          {/* --- Identity Block --- */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-16 h-16 shrink-0 rounded-[1.25rem] bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-slate-200 dark:shadow-none">
                {getInitials(personnel.name)}
              </div>

              {isOrgOwner && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-white shadow-sm">
                  <Crown className="text-[10px] w-3 h-3" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full text-lg font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md outline-none border border-indigo-600/20 focus:border-indigo-600 transition-all"
                />
              ) : (
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 leading-tight truncate tracking-tight">{personnel.name}</h3>
              )}

              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[12px] font-medium text-slate-400 truncate lowercase">{personnel.email}</p>

                <button onClick={() => copyToClipboard(personnel.email, dispatch)} className="text-slate-300 hover:text-indigo-500 transition-colors" aria-label="Copy email">
                  <Copy className="text-xs w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* --- Primary Details --- */}
          <div className="space-y-4 border-t border-black/[0.03] dark:border-slate-800 pt-6">
            <PropertyRow
              icon={<Activity className="w-4 h-4" />}
              label="Integrity State"
              value={
                <div
                  className={`flex items-center gap-2 px-2 py-1 rounded-md border text-[10px] font-black uppercase w-fit ${
                    isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:border-red-800"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                  {isActive ? "Clear & Active" : personnel.isLocked ? "Locked" : "Disabled"}
                </div>
              }
            />

            <PropertyRow
              icon={<Folder className="w-4 h-4" />}
              label="Branch Registry"
              value={
                <div className="flex flex-col gap-1.5 w-full">
                  {personnel.branchAssignments?.length > 0 ? (
                    personnel.branchAssignments.map((assignment: any) => (
                      <div
                        key={assignment.branchId}
                        className={`flex items-center gap-2 px-2.5 py-1 rounded-md border border-black/[0.04] dark:border-slate-700 text-[12px] font-medium truncate w-fit ${getBranchColor(assignment.isPrimary)} ${assignment.isPrimary ? 'bg-slate-50 dark:bg-slate-800' : 'bg-transparent text-slate-400'}`}
                      >
                        <span className={`w-2 h-2 shrink-0 rounded-full ${getDepartmentColor(assignment.branch.name)}`} />
                        <span className="truncate">{assignment.branch.name} {assignment.isPrimary && <span className="text-[10px] text-slate-400 ml-1">(Primary)</span>}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 w-fit px-2.5 py-1 rounded-md border border-black/[0.04] dark:border-slate-700 truncate">
                      <span className={`w-2 h-2 shrink-0 rounded-full ${getDepartmentColor(personnel.branch?.name || "Unassigned")}`} />
                      <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300 truncate">{personnel.branch?.name || "Global / Unassigned"}</span>
                    </div>
                  )}
                </div>
              }
            />

            <PropertyRow
              icon={<Fingerprint className="w-4 h-4" />}
              label="Staff Code"
              value={
                <span className="font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded border border-black/[0.03] dark:border-slate-700">
                  {personnel.staffCode || "SYS-PROVISIONED"}
                </span>
              }
            />

            <PropertyRow
              icon={<Briefcase className="w-4 h-4" />}
              label="System Role"
              value={
                isEditing ? (
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                    className="text-[11px] font-black text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded-md border border-black/5 dark:border-slate-700 w-full outline-none"
                  >
                    {Object.values(Role).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md uppercase tracking-wider">
                    {personnel.role}
                  </span>
                )
              }
            />

            {/* Credential Rotation UI */}
            <PropertyRow
              icon={<Key className="w-4 h-4" />}
              label={requiresPasswordChange ? "Vault Credential" : "Security State"}
              value={
                fetchingTemp ? (
                  <Loader2 className="animate-spin text-slate-400 w-5 h-5" />
                ) : tempPassword ? (
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                      <span className="font-mono text-[11px] font-black text-amber-700 dark:text-amber-400 tracking-wider">{tempPassword}</span>
                      <button onClick={() => copyToClipboard(tempPassword, dispatch)} className="text-amber-500 hover:text-amber-700" aria-label="Copy temp credential">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={handleResetPassword}
                      className="ml-1 w-6 h-6 flex items-center justify-center rounded-md transition-all active:scale-90 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600"
                      title="Regenerate Key"
                    >
                      <RefreshCw className="text-lg w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleResetPassword}
                    className="text-[10px] font-bold uppercase flex items-center gap-1 group text-blue-500 hover:text-blue-700 dark:hover:text-blue-400"
                  >
                    <RefreshIcon className="w-4 h-4 transition-transform duration-500 group-hover:rotate-180" />
                    {requiresPasswordChange ? "Generate New" : "Rotate Key"}
                  </button>
                )
              }
            />
          </div>
        </div>

        {/* Right Column in Full Screen / Bottom Block in Side Panel */}
        <div className={`space-y-8 ${isFullScreen ? 'pt-0 border-t-0' : 'pt-6 border-t border-black/[0.03] dark:border-slate-800'}`}>
          {/* --- Action Suite --- */}
          <div>
            {isEditing ? (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-slate-900 dark:bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-200 dark:shadow-none transition-all active:scale-[0.98]"
                >
                  Commit Context
                </button>

                <button
                  onClick={() => {
                    setIsEditing(false);
                    setForm({ name: personnel.name || "", role: personnel.role });
                  }}
                  className="flex-1 py-3 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
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
                        personnel.isLocked ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800"
                      }`}
                    >
                      {personnel.isLocked ? <Unlock className="text-base w-4 h-4" /> : <Lock className="text-base w-4 h-4" />}
                      {personnel.isLocked ? "Unlock" : "Lock"}
                    </button>

                    <button
                      onClick={() => toggleSecurity("disabled", !personnel.disabled)}
                      className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${
                        personnel.disabled ? "bg-slate-900 dark:bg-slate-700 text-white border-slate-900 shadow-lg shadow-slate-200 hover:bg-slate-800 dark:shadow-none" : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800"
                      }`}
                    >
                      {personnel.disabled ? <UserCheck className="text-base w-4 h-4" /> : <UserX className="text-base w-4 h-4" />}
                      {personnel.disabled ? "Enable" : "Disable"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --- Collapsible Activity Log (Static Only) --- */}
          <div className="pt-6 border-t border-black/[0.03] dark:border-slate-800">
            <button
              onClick={() => setIsLogExpanded(!isLogExpanded)}
              className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl group transition-all border border-black/[0.01] dark:border-slate-700/50"
            >
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical Telemetry</span>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-300 dark:text-slate-500 font-mono">{eventCount} Events</span>
                {isLogExpanded ? <ChevronUp className="text-lg text-slate-400 w-5 h-5" /> : <ChevronDown className="text-lg text-slate-400 w-5 h-5" />}
              </div>
            </button>

            {isLogExpanded && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                <div className="px-2">
                  <div className="border-l-2 border-slate-100 dark:border-slate-800 pl-4 space-y-4">
                    {/* System Level Events */}
                    {rotationEvent && (
                      <div className="relative">
                        <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900 ring-4 ring-amber-50 dark:ring-amber-900/20" />
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Credential Rotated</p>
                        <p className="text-[9px] text-slate-400">Vault entry synchronized at {rotationEvent.time.toLocaleTimeString()}</p>
                      </div>
                    )}

                    <div className="relative">
                      <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900" />
                      <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Account Provisioned</p>
                      <p className="text-[9px] text-slate-400">Registry entry: {(personnel as any).createdAt ? new Date((personnel as any).createdAt).toLocaleString() : "Initial deployment"}</p>
                    </div>

                    {personnel.lastActivityAt && (
                      <div className="relative">
                        <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900 ring-4 ring-indigo-50 dark:ring-indigo-900/20" />
                        <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Last Registry Sync</p>
                        <p className="text-[9px] text-slate-400">
                          {new Date(personnel.lastActivityAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* --- Danger Zone --- */}
          {!isEditing && (
            <div className="pt-8 border-t border-red-50 dark:border-red-900/20 mt-8">
              <button
                onClick={handlePurge}
                className="w-full flex items-center justify-center gap-2 px-3 py-4 text-[10px] font-black uppercase tracking-[0.2em] border rounded-2xl transition-all group border-red-100 dark:border-red-900/30 text-red-500 bg-red-50/50 dark:bg-red-900/10 hover:bg-red-500 hover:text-white"
              >
                <Trash2 className="text-lg w-5 h-5 group-hover:animate-bounce" /> Purge Account Data
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}