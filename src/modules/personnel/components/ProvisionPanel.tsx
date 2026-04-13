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

  // Logic: Ensure identity is established before credentials can be generated
  const canGenerate = form.name.trim().length > 0 && form.email.trim().length > 0;

  const handleGeneratePassword = () => {
    if (!canGenerate) {
      return dispatch({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Identity Required", 
        message: "Please enter the staff name and email before generating a secure password." 
      });
    }
    const newPass = generateSecurePassword();
    setForm(prev => ({ ...prev, password: newPass }));
    dispatch({ 
      kind: "TOAST", 
      type: "INFO", 
      title: "Password Created", 
      message: "A high-entropy temporary password has been generated." 
    });
  };

  const handleSubmit = async () => {
    // Validation Logic
    if (!form.branchId || !form.name.trim() || !form.email.trim() || !form.password?.trim()) {
      return dispatch({ 
        kind: "TOAST", 
        type: "WARNING", 
        title: "Incomplete Form", 
        message: "All fields are required for system provisioning." 
      });
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
      // Execute creation (Backend handles secure hashing)
      await onCreate(sanitizedPayload);

      // Transition to success state to display credentials
      setSuccessCredentials(sanitizedPayload.password);
      dispatch({ 
        kind: "TOAST", 
        type: "SUCCESS", 
        title: "Provisioned", 
        message: "Staff profile initialized and live on the network." 
      });
      
    } catch (err: unknown) {
      console.error("[PROVISION_ERROR]:", err);
      dispatch({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Provisioning Failed", 
        message: "Could not initialize account. Please verify network connectivity." 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl relative overflow-hidden" role="dialog" aria-modal="true">
      {/* Header - Cleaned borders */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/50 dark:bg-transparent shrink-0 z-10">
        <div className="flex items-center gap-2 px-2 text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-[0.15em] whitespace-nowrap">
          <i className="bx bx-user-plus text-blue-500 text-lg" /> 
          Provision Staff
        </div>
        <button 
          onClick={onClose} 
          className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95"
        >
          <i className="bx bx-x text-xl" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-7 custom-scrollbar">
        {successCredentials ? (
          /* Success View */
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="p-5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-bold text-[13px]">
                <i className="bx bxs-check-circle text-xl text-emerald-500" /> 
                Provisioning Complete
              </div>
              <p className="text-[12.5px] text-emerald-800/80 dark:text-emerald-400/80 leading-relaxed">
                The profile for <strong>{form.name}</strong> is active. Share this temporary password for their initial terminal access.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 pl-1 uppercase tracking-widest block">
                Access Token / Password
              </label>
              <div className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700 rounded-2xl">
                <code className="flex-1 px-4 py-3 bg-transparent text-[15px] text-slate-800 dark:text-slate-200 font-mono tracking-widest truncate">
                  {successCredentials}
                </code>
                <button 
                  onClick={() => copyToClipboard(successCredentials, dispatch)} 
                  className="px-5 py-3 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-[12px] font-bold hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-600 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                >
                  <i className="bx bx-copy text-lg text-blue-500" /> Copy
                </button>
              </div>
            </div>
            
            <button 
              onClick={onClose} 
              className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-[13px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              Close Panel
            </button>
          </div>
        ) : (
          /* Entry View */
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="p-4 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100/50 dark:border-blue-500/10 rounded-2xl flex gap-3 text-blue-800 dark:text-blue-400">
              <i className="bx bx-shield-quarter text-xl shrink-0 text-blue-500" />
              <p className="text-[12px] font-medium leading-relaxed">
                New users are required to update their credentials upon their first entry to <b>MASA</b>.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pl-1 block uppercase tracking-wide">Full Name</label>
                <input 
                  value={form.name} 
                  placeholder="e.g. Adewale Chen" 
                  onChange={e => setForm({...form, name: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500/50 rounded-xl text-[14px] outline-none transition-all placeholder:text-slate-400" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pl-1 block uppercase tracking-wide">Email Address</label>
                <input 
                  value={form.email} 
                  type="email" 
                  placeholder="user@company.com" 
                  onChange={e => setForm({...form, email: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500/50 rounded-xl text-[14px] outline-none transition-all placeholder:text-slate-400" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pl-1 block uppercase tracking-wide">System Role</label>
                  <select 
                    value={form.role} 
                    onChange={e => setForm({...form, role: e.target.value as Role})} 
                    className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer transition-all"
                  >
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pl-1 block uppercase tracking-wide">Primary Branch</label>
                  <select 
                    value={form.branchId} 
                    onChange={e => setForm({...form, branchId: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer transition-all"
                  >
                    <option value="" className="text-slate-400">Select...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 pl-1 block uppercase tracking-wide">Temporary Password</label>
                <div className="relative flex items-center">
                  <input 
                    type="text" 
                    value={form.password} 
                    placeholder="Enter or generate" 
                    onChange={e => setForm({...form, password: e.target.value})} 
                    className="w-full pl-4 pr-12 py-3 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500/50 rounded-xl text-[14px] font-mono outline-none transition-all placeholder:text-slate-400 placeholder:font-sans" 
                  />
                  <button 
                    type="button" 
                    onClick={handleGeneratePassword} 
                    className={`absolute right-2 p-1.5 rounded-lg transition-all flex items-center justify-center ${canGenerate ? 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 active:scale-95' : 'text-slate-300 dark:text-slate-700 bg-transparent'}`} 
                    title={canGenerate ? "Generate Secure Password" : "Name and Email required first"}
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
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0 z-10">
              <button 
                onClick={handleSubmit} 
                disabled={isSaving} 
                className="w-full py-3 bg-slate-900 dark:bg-blue-600 text-white rounded-xl text-[12px] font-bold tracking-widest uppercase hover:bg-slate-800 dark:hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none flex justify-center items-center"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <i className="bx bx-loader-alt animate-spin text-base" /> 
                    Processing...
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