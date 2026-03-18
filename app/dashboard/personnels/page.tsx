"use client";

import React, { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSidePanel } from "@/components/layout/SidePanelContext";

/* ==========================================================================
   1. TYPES & INTERFACES (STRICT TYPESCRIPT)
   ========================================================================== */

export enum Role {
  DEV = "DEV",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  SALES = "SALES",
  INVENTORY = "INVENTORY",
  CASHIER = "CASHIER"
}

export interface Branch {
  id: string;
  name: string;
}

export interface BranchAssignment {
  branchId: string;
  role: Role;
  isPrimary: boolean;
  branch: { name: string };
}

export interface Personnel {
  id: string;
  staffCode: string | null;
  name: string;
  email: string;
  role: Role;
  disabled: boolean;
  isLocked: boolean;
  lockReason?: string | null;
  lastActivityAt: string | null;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  branchAssignments: BranchAssignment[];
}


export interface ProvisionPayload {
  name: string;
  email: string;
  role: Role;
  branchId: string;
  password?: string;
  generatePassword?: boolean;
}

export interface UpdatePayload {
  name?: string;
  email?: string;
  role?: Role;
  disabled?: boolean;
  isLocked?: boolean;
  lockReason?: string | null;
  newPassword?: string;
}

export interface SummaryStats {
  total: number;
  active: number;
  disabled: number;
  locked: number;
}

export interface PaginatedResponse {
  data: Personnel[];
  total: number;
  page: number;
  pageSize: number;
  summary: SummaryStats;
  branchSummaries: { id: string; name: string; count: number }[];
  recentLogs: ActivityLog[];
}

/* ==========================================================================\
   TYPES & CONSTANTS
   ========================================================================== */
interface ActivityLogDTO {
  id: string;
  action: string;
  critical: boolean;
  createdAt: string;
  time?: string;
  details?: string;
  ipAddress?: string;
  deviceInfo?: string;
  approvalId?: string;
  personnel?: { name: string; email: string };
  performedBy?: string;
  personnelName?: string;
  branch?: { name: string };
  metadata?: Record<string, any>;
}

const parseDevice = (ua?: string) => {
  if (!ua) return "Internal System";
  if (ua.includes("Windows")) return "Windows PC";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("Android")) return "Android Device";
  if (ua.includes("Macintosh")) return "MacBook / iMac";
  if (ua.includes("Postman") || ua.includes("curl")) return "API Client";
  return ua.split(" ")[0]; // Fallback to first part of UA string
};

const LOG_TABS = {
  ALL: "ALL_ACTIONS",
  SECURITY: "SECURITY",
  PROVISION: "PROVISION",
  UPDATE: "UPDATE",
  LOCKED: "ACCOUNT_LOCKED",
};

/* ==========================================================================\
   HELPER: Format Metadata
   ========================================================================== */
const formatMetadata = (metadata?: Record<string, any>): string | null => {
  if (!metadata) return null;
  if (metadata.details) return metadata.details;
  if (metadata.targetName) return `Target: ${metadata.targetName}`;
  return null;
};

function getDepartmentColor(name: string): string {
  const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];
  return colors[Math.abs(hash) % colors.length];
}

function generateSecurePassword(): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password;
}

async function copyToClipboard(text: string, dispatch: (action: AlertAction) => void): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Copied", message: "Password copied to clipboard!" });
    } else {
      throw new Error("Clipboard API unavailable");
    }
  } catch (err: unknown) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Copied", message: "Password copied to clipboard!" });
    } catch (fallbackErr: unknown) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Copy Failed", message: "Please manually copy the password." });
    }
    document.body.removeChild(textArea);
  }
}

/* ==========================================================================
   3. TOAST ALERT CONTEXT
   ========================================================================== */

type AlertType = "SUCCESS" | "WARNING" | "ERROR" | "INFO";

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
}

interface AlertAction {
  kind: "TOAST";
  type: AlertType;
  title: string;
  message: string;
}

interface AlertContextValue {
  dispatch: (action: AlertAction) => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used within AlertProvider");
  return ctx;
}

function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const dispatch = useCallback((action: AlertAction) => {
    const id = Math.random().toString(36).substring(2, 9);
    setAlerts(prev => [...prev, { id, ...action }]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, 4000);
  }, []);

  return (
    <AlertContext.Provider value={{ dispatch }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {alerts.map(alert => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className={`pointer-events-auto flex items-start gap-3 w-[320px] p-4 rounded-xl shadow-xl border backdrop-blur-md ${
                alert.type === "SUCCESS" ? "bg-emerald-50/90 border-emerald-100 text-emerald-800" :
                alert.type === "WARNING" ? "bg-amber-50/90 border-amber-100 text-amber-800" :
                alert.type === "ERROR" ? "bg-red-50/90 border-red-100 text-red-800" :
                "bg-white/90 border-slate-100 text-slate-800"
              }`}
            >
              <div className="mt-0.5">
                {alert.type === "SUCCESS" && <i className="bx bx-check-circle text-lg" />}
                {alert.type === "WARNING" && <i className="bx bx-error text-lg" />}
                {alert.type === "ERROR" && <i className="bx bx-error-circle text-lg" />}
                {alert.type === "INFO" && <i className="bx bx-info-circle text-lg" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[13px] font-bold tracking-tight">{alert.title}</h4>
                <p className="text-[12px] opacity-80 leading-snug mt-0.5">{alert.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AlertContext.Provider>
  );
}

/* ==========================================================================
   4. SHARED COMPONENTS
   ========================================================================== */

function StatusGridBadge({ status }: { status: "active" | "locked" | "disabled" }) {
  if (status === "active") {
    return (
      <div className="flex items-center gap-1.5 text-emerald-600">
        <i className="bx bx-check-circle text-sm" />
        <span className="text-[11px] font-medium">Active</span>
      </div>
    );
  }
  if (status === "disabled") {
    return (
      <div className="flex items-center gap-1.5 text-slate-400 opacity-80">
        <i className="bx bx-minus-circle text-sm" />
        <span className="text-[11px] font-medium">Disabled</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-amber-600">
      <i className="bx bx-lock-alt text-sm" />
      <span className="text-[11px] font-medium">Locked</span>
    </div>
  );
}

function PropertyRow({ icon, label, value }: { icon: string, label: string, value: React.ReactNode }) {
  return (
    <div className="flex items-center text-[13px] group">
      <div className="w-32 shrink-0 flex items-center gap-2 text-slate-400 font-medium">
        <i className={`${icon} text-slate-300 group-hover:text-slate-500 transition-colors`} /> {label}
      </div>
      <div className="text-slate-800 flex-1 min-w-0">{value}</div>
    </div>
  );
}

/* ==========================================================================
   5. SIDE PANELS (Injected into Global Context)
   ========================================================================== */

interface DetailsPanelProps {
  personnel: Personnel;
  onClose: () => void;
  onUpdate: (id: string, payload: UpdatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  dispatch: (action: AlertAction) => void;
}

function DetailsPanel({ personnel, onClose, onUpdate, onDelete, dispatch }: DetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ name: personnel.name, role: personnel.role });

  const handleSave = async () => {
    try {
      await onUpdate(personnel.id, form);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Saved", message: "Profile updated successfully." });
      setIsEditing(false);
    } catch (e: unknown) {
      // Errors handled by parent
    }
  };

  const toggleSecurity = async (key: keyof UpdatePayload, val: boolean) => {
    try {
      const payload: UpdatePayload = { [key]: val };
      if (key === 'isLocked' && val) payload.lockReason = prompt("Reason for locking account?") || "Administratively locked";
      
      await onUpdate(personnel.id, payload);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Security Updated", message: "Account access status modified." });
    } catch (e: unknown) {}
  };

  return (
    <div className="h-full flex flex-col w-full bg-white relative">
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white shrink-0 z-10">
        <div className="flex items-center gap-2 px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          <i className="bx bx-sidebar" /> Inspector
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
              <i className="bx bx-pencil text-sm" />
            </button>
          )}
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors">
            <i className="bx bx-x text-lg" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-2xl font-bold shadow-sm">
            {personnel.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full text-lg font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded outline-none border border-black/5"
              />
            ) : (
              <h3 className="text-xl font-semibold text-slate-900 leading-tight truncate">{personnel.name}</h3>
            )}
            <p className="text-[13px] text-slate-500 mt-1 truncate">{personnel.email}</p>
          </div>
        </div>

        <div className="space-y-4 border-t border-black/5 pt-6">
          <PropertyRow icon="bx bx-hash" label="Staff ID" value={<span className="font-mono text-[12px] bg-slate-50 px-2 py-1 rounded border border-black/5">{personnel.staffCode || "PENDING"}</span>} />
          <PropertyRow icon="bx bx-folder" label="Department" value={
            <div className="flex items-center gap-2 bg-slate-50 w-fit px-2.5 py-1 rounded-md border border-black/[0.04] truncate">
              <span className={`w-2 h-2 shrink-0 rounded-full ${getDepartmentColor(personnel.branch?.name || "Unassigned")}`} />
              <span className="text-[12px] font-medium text-slate-700 truncate">{personnel.branch?.name || "None"}</span>
            </div>
          } />
          <PropertyRow icon="bx bx-briefcase" label="Role" value={
            isEditing ? (
              <select
                value={form.role}
                onChange={e => setForm({...form, role: e.target.value as Role})}
                className="text-[12px] font-semibold text-slate-700 bg-slate-100 px-2 py-1.5 rounded outline-none border border-black/5 w-full cursor-pointer"
              >
                {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            ) : (
              <span className="text-[12px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded uppercase tracking-wider">{personnel.role}</span>
            )
          } />
          <PropertyRow icon="bx bx-calendar" label="Last Active" value={personnel.lastActivityAt ? new Date(personnel.lastActivityAt).toLocaleString() : <span className="text-amber-500 italic">Never Logged In</span>} />
        </div>

        {isEditing && (
          <div className="flex gap-2 pt-4">
            <button onClick={handleSave} className="flex-1 py-2 bg-slate-900 text-white text-[12px] font-semibold rounded-lg hover:bg-slate-800 transition-colors">Save Changes</button>
            <button onClick={() => setIsEditing(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-[12px] font-semibold rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          </div>
        )}

        {!isEditing && (
          <div className="pt-8 border-t border-black/5 space-y-2 pb-6">
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Access Security</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleSecurity("isLocked", !personnel.isLocked)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border rounded-lg transition-colors ${personnel.isLocked ?
                "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100"}`}
              >
                <i className={`bx ${personnel.isLocked ? "bx-lock-open" : "bx-lock-alt"} text-sm`} /> {personnel.isLocked ? "Unlock" : "Lock"}
              </button>
              <button
                onClick={() => toggleSecurity("disabled", !personnel.disabled)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border rounded-lg transition-colors ${personnel.disabled ?
                "bg-slate-900 text-white border-slate-900 hover:bg-slate-800" : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100"}`}
              >
                <i className={`bx ${personnel.disabled ? "bx-check-circle" : "bx-minus-circle"} text-sm`} /> {personnel.disabled ? "Enable" : "Disable"}
              </button>
            </div>
            
            <div className="pt-4 border-t border-black/5 space-y-2 mt-4">
              <button onClick={() => onDelete(personnel.id)} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[12px] font-medium border border-red-100 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                 <i className="bx bx-trash" /> Deactivate Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ProvisionPanelProps {
  onClose: () => void;
  onCreate: (payload: ProvisionPayload) => Promise<void>;
  branches: Branch[];
  dispatch: (action: AlertAction) => void;
}

function ProvisionPanel({ onClose, onCreate, branches, dispatch }: ProvisionPanelProps) {
  const [form, setForm] = useState<ProvisionPayload>({
    name: "",
    email: "",
    role: Role.CASHIER,
    branchId: "",
    password: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [successCredentials, setSuccessCredentials] = useState<string | null>(null);

  const handleGeneratePassword = () => {
    const newPass = generateSecurePassword();
    setForm(prev => ({ ...prev, password: newPass }));
    dispatch({ kind: "TOAST", type: "INFO", title: "Generated", message: "A secure temporary password has been created." });
  };

  const handleSubmit = async () => {
    if (!form.branchId || !form.name.trim() || !form.email.trim() || !form.password?.trim()) {
      return dispatch({ kind: "TOAST", type: "WARNING", title: "Missing Fields", message: "Please ensure all fields are filled." });
    }
    setIsSaving(true);
    const sanitizedPayload: ProvisionPayload = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password.trim(),
      generatePassword: false
    };
    try {
      await onCreate(sanitizedPayload);
      setSuccessCredentials(sanitizedPayload.password ?? "");
    } catch (err: unknown) {
      // Handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-white relative">
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white shrink-0 z-10">
        <div className="flex items-center gap-2 px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          <i className="bx bx-user-plus" /> Provision Staff
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors">
          <i className="bx bx-x text-lg" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {successCredentials ? (
          <div className="space-y-6">
            <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
                <i className="bx bx-check-circle text-xl" /> Account Provisioned
              </div>
              <p className="text-[13px] text-emerald-800/80 leading-relaxed font-medium">The account has been created successfully. Ensure the user receives this temporary password.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-500 pl-1 uppercase tracking-wider">Temporary Password</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[14px] text-slate-700 font-mono tracking-wider truncate">{successCredentials}</code>
                <button
                  onClick={() => copyToClipboard(successCredentials, dispatch)}
                  className="px-4 py-3 bg-slate-900 text-white rounded-lg text-[13px] font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm shrink-0"
                >
                  <i className="bx bx-copy" /> Copy
                </button>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[12px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors">Back to Personnel List</button>
          </div>
        ) : (
          <>
            <div className="p-4 bg-slate-50 border border-black/5 rounded-xl flex gap-3 text-slate-600">
              <i className="bx bx-info-circle text-lg shrink-0 text-blue-500" />
              <p className="text-[12px] font-medium leading-relaxed">Provide a temporary password or use the generator.
              The user will update this upon their first entry to <b>MASA</b>.</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 pl-1">Full Name</label>
                <input value={form.name} placeholder="e.g. Jane Doe" onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-[13px] font-medium outline-none transition-all placeholder:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 pl-1">Email Address</label>
                <input value={form.email} type="email" placeholder="jane.doe@company.com" onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-[13px] font-medium outline-none transition-all placeholder:text-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 pl-1">Temporary Password</label>
                <div className="relative flex items-center">
                  <input type="text" value={form.password} placeholder="Set or generate password" onChange={e => setForm({...form, password: e.target.value})} className="w-full pl-3 pr-12 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white rounded-lg text-[13px] font-mono outline-none transition-all" />
                  <button type="button" onClick={handleGeneratePassword} className="absolute right-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Generate Secure Password">
                    <i className="bx bx-refresh text-xl" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 pl-1">System Role</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value as Role})} className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white rounded-lg text-[13px] font-semibold text-slate-700 outline-none cursor-pointer transition-all uppercase tracking-wider">
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 pl-1">Primary Branch</label>
                  <select value={form.branchId} onChange={e => setForm({...form, branchId: e.target.value})} className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white rounded-lg text-[13px] font-medium text-slate-700 outline-none cursor-pointer transition-all">
                    <option value="" className="text-slate-400">Select...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {!successCredentials && (
        <div className="p-6 border-t border-black/5 bg-slate-50/50 shrink-0">
          <button onClick={handleSubmit} disabled={isSaving} className="w-full py-3 bg-slate-900 text-white rounded-xl text-[13px] font-semibold tracking-wide shadow-md shadow-slate-900/10 hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:pointer-events-none">
            {isSaving ? <span className="flex items-center justify-center gap-2"><i className="bx bx-loader-alt animate-spin" /> Provisioning...</span> : "Initialize Account"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ActivityLogsPanel({ logs, onClose }: { logs: ActivityLogDTO[], onClose: () => void }) {
  const [filter, setFilter] = useState<string>(LOG_TABS.ALL);
  const router = useRouter();

  const filteredLogs = useMemo(() => {
    if (filter === LOG_TABS.ALL) return logs;
    return logs.filter((l) => {
      const action = l.action.toUpperCase();
      if (filter === LOG_TABS.SECURITY) return /LOCK|ACCESS|LOGIN|PASSWORD|AUTH/.test(action);
      if (filter === LOG_TABS.PROVISION) return /CREATE|ASSIGN|DELETED/.test(action);
      if (filter === LOG_TABS.UPDATE) return /UPDATE|PATCH|EDIT|ENABLED|DISABLED/.test(action);
      return action.includes(filter);
    });
  }, [logs, filter]);

  return (
    <div className="h-full flex flex-col w-full bg-[#FAFAFC] relative">
      {/* HEADER */}
      <div className="p-5 border-b border-black/5 bg-white shrink-0 space-y-5">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-black/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 
            Live_Audit_Trail
          </h2>
          <button onClick={onClose} className="w-6 h-6 rounded-full hover:bg-black/5 flex items-center justify-center text-slate-400 transition-colors">
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {Object.values(LOG_TABS).map((a) => (
            <button 
              key={a} 
              onClick={() => setFilter(a)} 
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tight transition-all border ${
                filter === a ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-black/30 border-black/5 hover:border-black/20"
              }`}
            >
              {a.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* LOG LIST */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {filteredLogs.map((log) => {
          const performerName = log.personnel?.name ?? log.performedBy ?? "System";
          const targetName = log.personnelName ?? (log.metadata?.targetName as string) ?? "N/A";
          
          const dateStr = new Date(log.createdAt).toLocaleString('en-US', { 
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
          });
          
          const deviceName = parseDevice(log.deviceInfo);
          const techString = `${dateStr} :: ${log.ipAddress || "127.0.0.1"} • ${deviceName}`;

          return (
            <motion.div 
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              key={log.id} 
              onClick={() => router.push(`/dashboard/activity/${log.id}`)}
              className="p-4 bg-white border border-black/[0.04] rounded-2xl cursor-pointer hover:border-black/20 hover:shadow-xl transition-all group active:scale-[0.98]"
            >
              {/* 1. Header: Initials & Action */}
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${log.critical ? 'bg-amber-500' : 'bg-slate-900'}`}>
                    {performerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">{performerName}</span>
                </div>
                <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-md tracking-widest ${log.critical ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                  {log.action.replace(/_/g, " ")}
                </span>
              </div>

              {/* 2. Body: Description & Target */}
              <div className="pl-8.5 space-y-2">
                <p className="text-[11px] font-semibold text-slate-600 leading-snug">
                  {log.details || (log.metadata?.details as string) || "Activity record generated."}
                </p>
                
                <div className="flex items-center gap-2 py-1.5 px-2 bg-slate-50 rounded-lg border border-black/[0.02]">
                  <span className="text-[8px] font-black text-black/20 uppercase tracking-tighter">Target</span>
                  <span className="text-[9px] font-bold text-slate-800 truncate">{targetName}</span>
                </div>
              </div>

              {/* 3. Footer: System String */}
              <div className="mt-4 pt-3 border-t border-black/[0.03]">
                <div className="flex justify-between items-center">
                  <p className="text-[8px] font-bold text-slate-400 font-mono tracking-tighter opacity-60 group-hover:opacity-100 transition-opacity">
                    {techString}
                  </p>
                  <i className="bx bx-chevron-right text-slate-300 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   6. LIST ROWS
   ========================================================================== */

function PersonnelRow({ personnel, isSelected, onClick }: { personnel: Personnel, isSelected: boolean, onClick: () => void }) {
  const hasMultipleAssignments = personnel.branchAssignments && personnel.branchAssignments.length > 1;
  const [isExpanded, setIsExpanded] = useState(false);
  const status = personnel.disabled ? "disabled" : personnel.isLocked ? "locked" : "active";
  const depName = personnel.branch?.name || "Unassigned";

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="flex flex-col w-full border-b border-black/[0.04] last:border-none group">
      <motion.div layoutId={`person-${personnel.id}`} onClick={onClick} className={`flex items-center px-4 md:px-8 py-3 transition-colors cursor-pointer text-[13px] ${isSelected ? "bg-blue-50/50" : "hover:bg-slate-50/80"}`}>
        <div className="w-[120px] md:w-[140px] shrink-0 flex items-center gap-2 relative">
          <button onClick={hasMultipleAssignments ? toggleExpand : undefined} className={`w-5 h-5 flex items-center justify-center rounded hover:bg-black/5 shrink-0 ${!hasMultipleAssignments && 'opacity-30 cursor-default'}`}>
            {hasMultipleAssignments ? <i className={`bx bx-caret-right text-[10px] text-slate-400 transition-transform ${isExpanded ?
              'rotate-90' : ''}`} /> : <span className="w-1 h-1 rounded-full bg-slate-300" />}
          </button>
          <span className="font-mono text-slate-600 font-medium tracking-tight truncate">{personnel.staffCode || "PENDING"}</span>
          {!personnel.lastActivityAt && <div className="absolute right-4 md:right-6 top-1.5 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[4px] border-l-transparent border-r-transparent border-b-amber-400 rotate-45 shrink-0" title="Pending OTP Verification" />}
        </div>
        <div className="w-[120px] md:w-[160px] shrink-0 flex items-center pr-2">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-black/[0.02] border border-black/[0.04] rounded-md max-w-full">
            <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${getDepartmentColor(depName)}`} />
            <span className="text-[11px] font-medium text-slate-700 truncate">{depName}</span>
          </div>
        </div>
        <div className="flex-1 min-w-[100px] text-slate-500 truncate pr-4 hidden sm:block">{personnel.email}</div>
        <div className="w-[90px] md:w-[120px] shrink-0 pr-2">
          <span className="text-[10px] md:text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider truncate block w-fit max-w-full">{personnel.role}</span>
        </div>
        <div className="flex-1 min-w-[120px] text-slate-800 font-medium truncate pr-4">{personnel.name}</div>
        <div className="w-[80px] md:w-[100px] shrink-0"><StatusGridBadge status={status} /></div>
      </motion.div>
      <AnimatePresence>
        {hasMultipleAssignments && isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-slate-50/50 flex flex-col w-full border-t border-black/[0.02] shadow-inner overflow-hidden">
            {personnel.branchAssignments.map((assignment, idx) => (
              <div key={idx} className="flex items-center px-4 md:px-8 py-2 border-b border-black/[0.02] last:border-none text-[12px] pl-[32px] md:pl-[144px]">
                <div className="w-[120px] md:w-[160px] shrink-0 flex items-center pr-2">
                  <div className="flex items-center gap-2 px-2 py-0.5 opacity-80 max-w-full truncate">
                    <span className={`w-1 h-1 shrink-0 rounded-full ${getDepartmentColor(assignment.branch.name)}`} />
                    <span className="text-[11px] font-medium text-slate-600 truncate">{assignment.branch.name}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[100px] text-slate-400 italic text-[11px] hidden sm:block truncate pr-2">Secondary Assignment</div>
                <div className="w-[90px] md:w-[120px] shrink-0"><span className="text-[10px] font-semibold text-slate-400 bg-black/5 px-1.5 py-0.5 rounded uppercase tracking-wider truncate block w-fit max-w-full">{assignment.role}</span></div>
                <div className="flex-1 min-w-[120px]" /><div className="w-[80px] md:w-[100px] shrink-0" />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ==========================================================================
   7. MAIN PAGE COMPONENT
   ========================================================================== */

function PersonnelManagementInner() {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, isOpen } = useSidePanel();
  
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
    closePanel();
    setSelectedPersonId(null);
  }, [closePanel]);

  // Ensure panels are cleared when page is unmounted
  useEffect(() => {
    return () => closePanel();
  }, [closePanel]);

  const fetchPersonnel = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(`/api/personnels?search=${encodeURIComponent(searchTerm)}&status=${filterStatus}`, {
        signal: abortControllerRef.current.signal
      });
      if (!res.ok) throw new Error("Sync Failed");
      const json: PaginatedResponse = await res.json();
      setPersonnelList(json.data || []);
      setSummary(json.summary || { total: 0, active: 0, disabled: 0, locked: 0 });
      setBranches(json.branchSummaries || []);
      setLogs(json.recentLogs || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
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
    const res = await fetch("/api/personnels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to provision");
    await fetchPersonnel();
  };

  const handleUpdate = async (id: string, payload: UpdatePayload) => {
    const originalList = [...personnelList];
    setPersonnelList(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));

    try {
      const res = await fetch("/api/personnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");
      await fetchPersonnel();
      
      // Keep panel in sync if it's currently open
      const updatedPerson = { ...(personnelList.find(p => p.id === id)), ...data };
      if (isOpen && selectedPersonId === id) {
        openPanel(<DetailsPanel personnel={updatedPerson} onClose={handleClosePanel} onUpdate={handleUpdate} onDelete={handleDelete} dispatch={dispatch} />);
      }
    } catch (err: unknown) {
      setPersonnelList(originalList); 
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: err instanceof Error ? err.message : "Persistence failed." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you absolutely sure you want to delete this account? This action will softly deactivate it.")) return;
    try {
      const res = await fetch(`/api/personnels?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to deactivate account");
      
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Deactivated", message: "Personnel record soft-deleted successfully." });
      handleClosePanel();
      await fetchPersonnel();
    } catch (error: unknown) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Action Failed", message: error instanceof Error ? error.message : "Deletion failed." });
    }
  };

  const handleOpenDetails = (person: Personnel) => {
    setSelectedPersonId(person.id);
    openPanel(<DetailsPanel personnel={person} onClose={handleClosePanel} onUpdate={handleUpdate} onDelete={handleDelete} dispatch={dispatch} />);
  };

  const handleOpenProvision = () => {
    setSelectedPersonId(null);
    openPanel(<ProvisionPanel branches={branches} onClose={handleClosePanel} onCreate={handleCreate} dispatch={dispatch} />);
  };

  const handleOpenLogs = () => {
    setSelectedPersonId(null);
    openPanel(<ActivityLogsPanel logs={logs} onClose={handleClosePanel} />);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative z-0">

      {/* Adjusting the left padding on the header to clear the back button space */}
      <header className="px-4 py-4 shrink-0 border-b border-black/[0.04]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Personnel Operations</h1>
            <p className="text-[13px] text-slate-500 mt-1">Manage global branch access, security parameters, and roles.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleOpenLogs} className="px-4 py-2 text-[12px] font-semibold border rounded-lg transition-colors flex items-center gap-2 bg-white border-black/5 text-slate-500 hover:bg-slate-50 hover:text-slate-800">
              <i className="bx bx-history text-sm" /> Audit Trail
            </button>
            <button onClick={handleOpenProvision} className="px-5 py-2 bg-slate-900 text-white text-[12px] font-semibold rounded-lg shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2">
              <i className="bx bx-plus text-sm" /> Provision Access
            </button>
          </div>
        </div>
        <div className="flex gap-6 mt-6 pt-4 border-t border-black/5 overflow-x-auto custom-scrollbar">
          <div className="flex flex-col"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Staff</span><span className="text-xl font-medium text-slate-800">{summary.total}</span></div>
          <div className="w-px h-8 bg-black/5 self-center" />
          <div className="flex flex-col"><span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Active Accounts</span><span className="text-xl font-medium text-slate-800">{summary.active}</span></div>
          <div className="w-px h-8 bg-black/5 self-center" />
          <div className="flex flex-col"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Disabled</span><span className="text-xl font-medium text-slate-800">{summary.disabled}</span></div>
          <div className="w-px h-8 bg-black/5 self-center" />
          <div className="flex flex-col"><span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Locked Out</span><span className="text-xl font-medium text-slate-800">{summary.locked}</span></div>
        </div>
      </header>

      <div className="px-6 md:px-10 py-3 shrink-0 flex items-center gap-4 bg-slate-50/50 border-b border-black/[0.04]">
        <div className="relative w-64 shrink-0">
          <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
          <input type="text" placeholder="Search ID, name, or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-1.5 bg-white border border-black/5 rounded-md text-[12px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/30 transition-all" />
        </div>
        <div className="h-4 w-px bg-black/10" />
        <div className="flex gap-1 overflow-x-auto custom-scrollbar">
          {["all", "active", "locked", "disabled"].map(status => (
            <button key={status} onClick={() => setFilterStatus(status)} className={`px-3 py-1 rounded text-[11px] font-semibold capitalize transition-colors ${filterStatus === status ?
              "bg-white border shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-800 hover:bg-black/5"}`}>{status}</button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 py-2 shrink-0 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-black/[0.04] bg-white">
        <div className="w-[120px] md:w-[140px] shrink-0">Staff ID</div>
        <div className="w-[120px] md:w-[160px] shrink-0">Primary Branch</div>
        <div className="flex-1 min-w-[100px] hidden sm:block">Email Address</div>
        <div className="w-[90px] md:w-[120px] shrink-0">Role</div>
        <div className="flex-1 min-w-[120px]">Personnel Name</div>
        <div className="w-[80px] md:w-[100px] shrink-0">Access</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white relative">
        {isLoading && personnelList.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10"><i className="bx bx-loader-alt animate-spin text-3xl text-blue-500" /></div>
        ) : personnelList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50 p-6"><i className="bx bx-group text-4xl text-black/20" /><p className="text-[12px] font-bold tracking-widest uppercase">No Personnel Found</p></div>
        ) : (
          personnelList.map(person => (
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

export default function PersonnelManagementPage() {
  return (
    <AlertProvider>
      <PersonnelManagementInner />
    </AlertProvider>
  );
}