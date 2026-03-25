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
      await onCreate(sanitizedPayload);
      setSuccessCredentials(sanitizedPayload.password ?? "");
    } catch (err: unknown) {
      // Error handling managed by parent or onCreate
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-white relative overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="provision-title">
      {/* Header */}
      <div className="p-4 border-b border-black/[0.04] flex justify-between items-center bg-white shrink-0 z-10">
        <div id="provision-title" className="flex items-center gap-2 px-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
          <i className="bx bx-user-plus" aria-hidden="true" /> Provision Staff
        </div>
        <button 
          onClick={onClose} 
          aria-label="Close panel"
          className="w-7 h-7 rounded hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-500 transition-colors shrink-0"
        >
          <i className="bx bx-x text-lg" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {successCredentials ? (
          <div className="space-y-6" role="alert">
            <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2 whitespace-nowrap">
                <i className="bx bx-check-circle text-xl" aria-hidden="true" /> Account Provisioned
              </div>
              <p className="text-[13px] text-emerald-800/80 leading-relaxed font-medium">
                The account has been created successfully. Ensure the user receives this temporary password.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-500 pl-1 uppercase tracking-wider block">Temporary Password</label>
              <div className="flex items-center gap-2 overflow-hidden">
                <code className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[14px] text-slate-700 font-mono tracking-wider truncate whitespace-nowrap" title={successCredentials}>
                  {successCredentials}
                </code>
                <button 
                  onClick={() => copyToClipboard(successCredentials, dispatch)} 
                  className="px-4 py-3 bg-slate-900 text-white rounded-lg text-[13px] font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-sm shrink-0 whitespace-nowrap"
                >
                  <i className="bx bx-copy" aria-hidden="true" /> Copy
                </button>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[12px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors whitespace-nowrap">
              Back to Personnel List
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 bg-slate-50 border border-black/5 rounded-xl flex gap-3 text-slate-600">
              <i className="bx bx-info-circle text-lg shrink-0 text-blue-500" aria-hidden="true" />
              <p className="text-[12px] font-medium leading-relaxed">
                Provide a temporary password or use the generator. The user will update this upon their first entry to <b>MASA</b>.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 pl-1 block">Full Name</label>
                <input 
                  value={form.name} 
                  placeholder="e.g. Jane Doe" 
                  onChange={e => setForm({...form, name: e.target.value})} 
                  className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-[13px] font-medium outline-none transition-all placeholder:text-slate-400 whitespace-nowrap truncate" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 pl-1 block">Email Address</label>
                <input 
                  value={form.email} 
                  type="email" 
                  placeholder="jane.doe@company.com" 
                  onChange={e => setForm({...form, email: e.target.value})} 
                  className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-[13px] font-medium outline-none transition-all placeholder:text-slate-400 whitespace-nowrap truncate" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 pl-1 block">Temporary Password</label>
                <div className="relative flex items-center overflow-hidden">
                  <input 
                    type="text" 
                    value={form.password} 
                    placeholder="Set or generate password" 
                    onChange={e => setForm({...form, password: e.target.value})} 
                    className="w-full pl-3 pr-12 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white rounded-lg text-[13px] font-mono outline-none transition-all whitespace-nowrap truncate" 
                  />
                  <button 
                    type="button" 
                    onClick={handleGeneratePassword} 
                    className={`absolute flex items-center justify-center right-0 p-2 rounded transition-colors shrink-0 ${canGenerate ? 'text-blue-500 hover:text-blue-600 hover:bg-blue-50' : 'text-slate-300'}`} 
                    title={canGenerate ? "Generate Secure Password" : "Enter name and email first"}
                    aria-label="Generate secure password"
                  >
                    <i className="bx bx-refresh text-xl" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 overflow-hidden">
                  <label className="text-[11px] font-semibold text-slate-500 pl-1 block whitespace-nowrap">System Role</label>
                  <select 
                    value={form.role} 
                    onChange={e => setForm({...form, role: e.target.value as Role})} 
                    className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white rounded-lg text-[13px] font-semibold text-slate-700 outline-none cursor-pointer transition-all uppercase tracking-wider truncate"
                  >
                    {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 overflow-hidden">
                  <label className="text-[11px] font-semibold text-slate-500 pl-1 block whitespace-nowrap">Primary Branch</label>
                  <select 
                    value={form.branchId} 
                    onChange={e => setForm({...form, branchId: e.target.value})} 
                    className="w-full px-3 py-2.5 bg-black/[0.02] border border-transparent focus:border-blue-500/30 focus:bg-white rounded-lg text-[13px] font-medium text-slate-700 outline-none cursor-pointer transition-all truncate"
                  >
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
          <button 
            onClick={handleSubmit} 
            disabled={isSaving} 
            className="w-full py-3 bg-slate-900 text-white rounded-xl text-[13px] font-semibold tracking-wide shadow-md shadow-slate-900/10 hover:bg-slate-800 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap overflow-hidden"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <i className="bx bx-loader-alt animate-spin" aria-hidden="true" /> Provisioning...
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