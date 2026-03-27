// File: @/modules/branches/components/BranchProvisionPanel.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";

import { ProvisionBranchPayload } from "@/types";

interface BranchProvisionPanelProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  dispatch: (action: any) => void;
}

export function BranchProvisionPanel({ onClose, onRefresh, dispatch }: BranchProvisionPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<ProvisionBranchPayload>({
    name: "",
    location: "",
    active: true,
  });

  const nameRef = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // autofocus name for fast input
    nameRef.current?.focus();
  }, []);

  const validate = () => {
    if (!form.name.trim()) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Validation Error", message: "Branch name is required." });
      nameRef.current?.focus();
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim(),
          active: !!form.active,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to deploy branch.");

      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Deployed", message: "Node deployed successfully." });
      await onRefresh();
      onClose();
    } catch (err: any) {
      console.error(err);
      dispatch({ kind: "TOAST", type: "ERROR", title: "Deployment Failed", message: err?.message || "Unknown error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-white relative z-20 border-l border-black/5">
      {/* Header */}
      <div className="p-5 md:p-6 border-b border-black/5 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <i className="bx bx-server text-lg" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm md:text-[13px] font-black uppercase  text-slate-900">Deploy New Node</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90"
          >
            <i className="bx bx-x text-lg" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-[#FAFAFC]">
        <div className="max-w-3xl mx-auto space-y-6">
          <section className="space-y-2">
            <h3 className="text-xl md:text-2xl font-extrabold text-slate-900">Node Provisioning</h3>
            <p className="text-sm text-slate-600">
              Initialize a new node in the infrastructure network. You can manage assignments and settings from the Node Inspector after deployment.
            </p>
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="space-y-6"
          >
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-600">Branch Name <span className="text-red-500">*</span></label>
              <input
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Lagos HQ"
                className="w-full bg-white border border-black/[0.04] rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                aria-required
                aria-label="Branch name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-600">Geographic Location</label>
              <input
                ref={locationRef}
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="Full address or region"
                className="w-full bg-white border border-black/[0.04] rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                aria-label="Geographic location"
              />
            </div>

            <div className="p-4 bg-white border border-black/[0.03] rounded-xl flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-900">Immediate Activation</div>
                <div className="text-[12px] text-slate-500">Allow operations immediately upon deployment</div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="sr-only peer"
                  aria-label="Immediate activation"
                />
                <div className="w-11 h-6 bg-slate-300 rounded-full peer-checked:bg-blue-600 relative transition-colors">
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                      form.active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
              </label>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 md:p-3 border-t border-black/5 bg-white sticky bottom-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={isSaving}
            className="flex-1 inline-flex items-center justify-center gap-3 px-2 py-3 rounded-xl bg-blue-600 text-white font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition disabled:opacity-60 disabled:pointer-events-none"
            aria-disabled={isSaving}
          >
            {isSaving ? (
              <>
                <i className="bx bx-loader-alt animate-spin text-lg" aria-hidden="true" />
                <span>Deploying Node...</span>
              </>
            ) : (
              <span>Deploy Node</span>
            )}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl bg-white border border-black/[0.04] text-sm font-semibold hover:bg-slate-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default BranchProvisionPanel;
