"use client";

import React, { useState } from "react";
import { Personnel, UpdatePayload, AlertAction } from "./types";
import { getDepartmentColor } from "./utils";
import { PropertyRow } from "./PropertyRow";

interface DetailsPanelProps {
  personnel: Personnel;
  onClose: () => void;
  onUpdate: (id: string, payload: UpdatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  dispatch: (action: AlertAction) => void;
}

export function DetailsPanel({ personnel, onClose, onUpdate, onDelete, dispatch }: DetailsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [form, setForm] = useState({ 
    name: personnel.name, 
    role: personnel.role,
    isOrgOwner: personnel.isOrgOwner 
  });

  const isActive = !personnel.disabled && !personnel.isLocked;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    dispatch({
      kind: "TOAST",
      type: "SUCCESS",
      title: "Copied",
      message: `${label} saved to clipboard.`
    });
  };

  const handleSave = async () => {
    try {
      await onUpdate(personnel.id, form);
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Protocol Synced", 
        message: "Personnel records updated." 
      });
      setIsEditing(false);
    } catch (e: unknown) {
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Sync Failed", 
        message: "Update rejected by server." 
      });
    }
  };

  const toggleSecurity = async (key: keyof UpdatePayload, val: boolean) => {
    try {
      const payload: UpdatePayload = { [key]: val };
      if (key === 'isLocked' && val) {
        payload.lockReason = prompt("Security lock reason:") || "Administratively locked";
      }
      await onUpdate(personnel.id, payload);
    } catch (e: unknown) {}
  };

  return (
    <div className="h-full flex flex-col w-[340px] bg-white relative font-sans">
      {/* --- Inspector Header --- */}
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white shrink-0 z-10">
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
              {personnel.name.charAt(0)}
            </div>
            {personnel.isOrgOwner && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 border-2 border-white rounded-full flex items-center justify-center text-white shadow-sm" title="Organization Owner">
                <i className="bx bxs-crown text-[10px]" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input 
                autoFocus
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})} 
                className="w-full text-lg font-bold text-slate-900 bg-slate-50 px-2 py-1 rounded-md outline-none border border-indigo-600/20 focus:border-indigo-600 transition-all" 
              />
            ) : (
              <h3 className="text-xl font-black text-slate-900 leading-tight truncate tracking-tight">
                {personnel.name}
              </h3>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[12px] font-medium text-slate-400 truncate lowercase">
                {personnel.email}
              </p>
              <button onClick={() => copyToClipboard(personnel.email, "Email")} className="text-slate-300 hover:text-indigo-500 transition-colors">
                <i className="bx bx-copy text-xs" />
              </button>
            </div>
          </div>
        </div>

        {/* --- Status & Primary Details --- */}
        <div className="space-y-4 border-t border-black/[0.03] pt-4">
          <PropertyRow 
            icon="bx bx-pulse" 
            label="Integrity Status" 
            value={
              <div className={`
                flex items-center gap-2 px-2 py-1 rounded-md border text-[10px] font-black uppercase w-fit
                ${isActive 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                  : "bg-red-50 text-red-600 border-red-100"
                }
              `}>
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                {isActive ? "Active" : "Disabled"}
              </div>
            } 
          />

          <PropertyRow 
            icon="bx bx-fingerprint" 
            label="Staff Code" 
            value={
              <div className="flex items-center gap-2 group">
                <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded border border-black/[0.03]">
                  {personnel.staffCode || "GUEST-PRMN"}
                </span>
                <button onClick={() => copyToClipboard(personnel.staffCode, "Staff Code")} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <i className="bx bx-copy text-slate-400 hover:text-indigo-500" />
                </button>
              </div>
            } 
          />
          
          <PropertyRow 
            icon="bx bx-key" 
            label="Org Ownership" 
            value={
              isEditing ? (
                <button 
                  onClick={() => setForm({...form, isOrgOwner: !form.isOrgOwner})}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold border transition-all ${form.isOrgOwner ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}
                >
                  {form.isOrgOwner ? "Owner Privileges Active" : "Standard Personnel"}
                </button>
              ) : (
                <span className={`text-[10px] font-bold uppercase ${personnel.isOrgOwner ? "text-amber-600" : "text-slate-400"}`}>
                  {personnel.isOrgOwner ? "Owner" : "Non-Owner"}
                </span>
              )
            } 
          />

          {/* --- Branch Assignments --- */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Deployment Branches</h4>
            <div className="space-y-2">
              {personnel.branchAssignments?.map((assignment, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-black/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getDepartmentColor(assignment.branch?.name)}`} />
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight">{assignment.branch?.name}</span>
                  </div>
                  <div className="flex gap-2 ">
                    {assignment.isPrimary && (
                      <span className="text-[8px] font-black bg-blue-700 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Primary</span>
                    )}
                    <span className="flex justify-center text-[10px] font-bold text-slate-400">{assignment.role}</span>
                  </div>
                </div>
              ))}
              {!personnel.branchAssignments?.length && (
                <p className="text-[10px] text-slate-400 italic">No branch assignments found.</p>
              )}
            </div>
          </div>
        </div>

        {/* --- Action Suite --- */}
        <div className="pt-6 border-t border-black/[0.03]">
          {isEditing ? (
            <div className="flex gap-2">
              <button onClick={handleSave} className="flex-1 py-3 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-[0.98]">
                Commit changes
              </button>
              <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-white text-slate-500 text-[11px] font-black uppercase tracking-widest rounded-xl border border-slate-200 hover:bg-slate-50 transition-all">
                Discard
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Security Protocol</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => toggleSecurity("isLocked", !personnel.isLocked)} className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${personnel.isLocked ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"}`}>
                    <i className={`bx ${personnel.isLocked ? "bx-lock-open" : "bx-lock-alt"} text-base`} /> 
                    {personnel.isLocked ? "Unlock" : "Lock"}
                  </button>
                  <button onClick={() => toggleSecurity("disabled", !personnel.disabled)} className={`flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-bold border rounded-xl transition-all active:scale-95 ${personnel.disabled ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200" : "bg-red-50 text-red-600 border-red-100"}`}>
                    <i className={`bx ${personnel.disabled ? "bx-user-check" : "bx-user-x"} text-base`} /> 
                    {personnel.disabled ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Collapsible Activity Log --- */}
        <div className="pt-6">
          <button 
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl group transition-all"
          >
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Historical Telemetry</span>
            <i className={`bx bx-chevron-down text-lg transition-transform duration-300 ${isLogExpanded ? "rotate-180" : ""}`} />
          </button>
          
          {isLogExpanded && (
            <div className="mt-4 space-y-4 px-2 animate-in fade-in slide-in-from-top-2">
              <div className="border-l-2 border-slate-100 pl-4 space-y-4">
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-slate-300 border-2 border-white" />
                  <p className="text-[10px] font-bold text-slate-800 uppercase">Account Provisioned</p>
                  <p className="text-[9px] text-slate-400">{new Date(personnel.createdAt).toLocaleString()}</p>
                </div>
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white" />
                  <p className="text-[10px] font-bold text-slate-800 uppercase">Last Registry Sync</p>
                  <p className="text-[9px] text-slate-400">{personnel.lastActivityAt ? new Date(personnel.lastActivityAt).toLocaleString() : "No telemetry recorded"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Danger Zone --- */}
        {!isEditing && (
          <div className="pt-6 border-t border-black/[0.03]">
            <button 
              onClick={() => confirm(`Purge ${personnel.name} from registry?`) && onDelete(personnel.id)} 
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