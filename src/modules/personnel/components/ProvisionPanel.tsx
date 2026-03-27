"use client";

import React, { useState } from "react";
import { ProvisionPayload, Branch, Role, AlertAction } from "./types";
import { generateSecurePassword, copyToClipboard } from "./utils";

interface ProvisionPanelProps {
  onClose: () => void;
  onCreate: (payload: ProvisionPayload) => Promise<void>;
  branches: Branch[];
  dispatch: (action: AlertAction) => void;
}

export function ProvisionPanel({ onClose, onCreate, branches, dispatch }: ProvisionPanelProps) {
  const [form, setForm] = useState<ProvisionPayload>({
    name: "",
    email: "",
    role: Role.CASHIER,
    branchId: "",
    password: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [successCredentials, setSuccessCredentials] = useState<string | null>(null);

  // Guard: Ensure name and email are present before allowing password generation
  const canGenerate = form.name.trim().length > 0 && form.email.trim().length > 0;

  const handleGeneratePassword = () => {
    if (!canGenerate) {
      return dispatch({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Identify Staff First", 
        message: "Please enter the staff member's name and email before generating a password." 
      });
    }
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
      // 1. Create the personnel record via parent handler (Backend handles hashing here)
      await onCreate(sanitizedPayload);

      // 2. Update UI instantly using local state. No vault persistence required here.
      setSuccessCredentials(sanitizedPayload.password);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Provisioned", message: "Staff account initialized successfully." });
      
    } catch (err: unknown) {
      console.error(err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Provisioning Failed", message: "Could not complete account initialization." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-white/95 backdrop-blur-xl relative overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="provision-title">
      {/* Header */}
      <div className="p-4 border-b border-slate-200/60 flex justify-between items-center bg-white/50 shrink-0 z-10">
        <div id="provision-title" className="flex items-center gap-2 px-2 text-[12px] font-bold text-slate-800 uppercase tracking-widest whitespace-nowrap">
          <i className="bx bx-user-plus text-blue-500 text-lg" aria-hidden="true" /> 
          Provision Staff
        </div>
        <button 
          onClick={onClose} 
          aria-label="Close panel"
          className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all shrink-0 active:scale-95"
        >
          <i className="bx bx-x text-xl" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-7 custom-scrollbar">
        {successCredentials ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500" role="alert">
            <div className="p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/60 rounded-2xl flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-800 font-bold mb-1 whitespace-nowrap text-[14px]">
                <i className="bx bxs-check-circle text-2xl text-emerald-500" aria-hidden="true" /> 
                Account Provisioned
              </div>
              <p className="text-[13px] text-emerald-800/80 leading-relaxed font-medium">
                The terminal profile for <strong>{form.name}</strong> is live. Provide them with this exact temporary password for their initial sign-in.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 pl-1 uppercase tracking-widest block">
                Temporary Password
              </label>
              <div className="flex items-center gap-2 overflow-hidden p-1 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-inner">
                <code className="flex-1 px-4 py-3 bg-transparent text-[15px] text-slate-800 font-mono tracking-widest truncate whitespace-nowrap" title={successCredentials}>
                  {successCredentials}
                </code>
                <button 
                  onClick={() => copyToClipboard(successCredentials, dispatch)} 
                  className="px-5 py-3 bg-white text-slate-800 rounded-xl text-[13px] font-bold hover:bg-slate-100 border border-slate-200/80 transition-all flex items-center gap-2 shadow-sm shrink-0 whitespace-nowrap active:scale-95"
                >
                  <i className="bx bx-copy text-lg text-blue-500" aria-hidden="true" /> Copy
                </button>
              </div>
            </div>
            
            <button 
              onClick={onClose} 
              className="w-full mt-4 py-3.5 bg-slate-100 text-slate-700 rounded-2xl text-[13px] font-bold tracking-wide hover:bg-slate-200 transition-colors whitespace-nowrap active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 text-blue-800 shadow-sm">
              <i className="bx bx-shield-quarter text-xl shrink-0 text-blue-500" aria-hidden="true" />
              <p className="text-[12.5px] font-medium leading-relaxed">
                Provide a temporary password. The user will be required to configure their permanent credentials upon their first entry to <b>MASA</b>.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 pl-1 block uppercase tracking-wide">Full Name</label>
                <input 
                  value={form.name} 
                  placeholder="e.g. Jane Doe" 
                  onChange={e => setForm({...form, name: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200/60 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-[14px] text-slate-800 font-medium outline-none transition-all placeholder:text-slate-400 shadow-sm" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 pl-1 block uppercase tracking-wide">Email Address</label>
                <input 
                  value={form.email} 
                  type="email" 
                  placeholder="jane.doe@company.com" 
                  onChange={e => setForm({...form, email: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200/60 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-[14px] text-slate-800 font-medium outline-none transition-all placeholder:text-slate-400 shadow-sm" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 overflow-hidden">
                  <label className="text-[11px] font-bold text-slate-500 pl-1 block uppercase tracking-wide">System Role</label>
                  <select 
                    value={form.role} 
                    onChange={e => setForm({...form, role: e.target.value as Role})} 
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200/60 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-[13px] font-bold text-slate-700 outline-none cursor-pointer transition-all shadow-sm"
                  >
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                
                <div className="space-y-1.5 overflow-hidden">
                  <label className="text-[11px] font-bold text-slate-500 pl-1 block uppercase tracking-wide">Primary Branch</label>
                  <select 
                    value={form.branchId} 
                    onChange={e => setForm({...form, branchId: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200/60 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-[13px] font-bold text-slate-700 outline-none cursor-pointer transition-all shadow-sm"
                  >
                    <option value="" className="text-slate-400">Select...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[11px] font-bold text-slate-500 pl-1 block uppercase tracking-wide">Temporary Password</label>
                <div className="relative flex items-center overflow-hidden shadow-sm rounded-xl">
                  <input 
                    type="text" 
                    value={form.password} 
                    placeholder="Enter or generate password" 
                    onChange={e => setForm({...form, password: e.target.value})} 
                    className="w-full pl-4 pr-12 py-3 bg-slate-50/50 border border-slate-200/60 focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-[14px] text-slate-800 font-mono outline-none transition-all placeholder:text-slate-400 placeholder:font-sans" 
                  />
                  <button 
                    type="button" 
                    onClick={handleGeneratePassword} 
                    className={`absolute right-2 p-1.5 rounded-lg transition-all shrink-0 flex items-center justify-center ${canGenerate ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 hover:scale-105 active:scale-95' : 'text-slate-300 bg-transparent'}`} 
                    title={canGenerate ? "Generate Secure Password" : "Enter name and email first"}
                    aria-label="Generate secure password"
                  >
                    <i className="bx bx-refresh text-xl" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {!successCredentials && (
        <div className="p-6 border-t border-slate-200/60 bg-white/80 backdrop-blur-md shrink-0 z-10">
          <button 
            onClick={handleSubmit} 
            disabled={isSaving} 
            className="w-full py-3.5 bg-slate-900 text-white rounded-2xl text-[14px] font-bold tracking-wide shadow-lg shadow-slate-900/20 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap overflow-hidden flex justify-center items-center"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <i className="bx bx-loader-alt animate-spin text-lg" aria-hidden="true" /> 
                Securing Profile...
              </span>
            ) : (
              "Initialize Account"
            )}
          </button>
        </div>
      )}
    </div>
  );
}