"use client";

import React, { useState, useRef, useEffect } from "react";
import { Server, X, Loader2 } from "lucide-react";

import { ProvisionBranchPayload } from "../types";

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
    nameRef.current?.focus();
  }, []);

  const validate = () => {
    if (!form.name.trim()) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Validation Error",
        message: "Branch name is required for provisioning.",
      });
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

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Node Deployed",
        message: `${form.name} has been successfully initialized.`,
      });

      await onRefresh();
      onClose();
    } catch (err: any) {
      console.error("[BRANCH_PROVISION_ERROR]:", err);
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Deployment Failed",
        message: err?.message || "Unknown infrastructure error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full bg-white dark:bg-slate-900 relative z-20 border-l border-slate-100 dark:border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600">
            <Server className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-800 dark:text-slate-200">
            Provision Node
          </h2>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 transition-all active:scale-90"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/30 dark:bg-slate-900/50">
        <section className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Branch Infrastructure</h3>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Initialize a new operational node in the <b>MASA</b> network. Geographic markers help optimize regional logistics and local currency handling.
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
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-1">
              Branch Identity <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Lagos HQ / Abuja Node"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-1">
              Geographic Marker
            </label>
            <input
              ref={locationRef}
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="Physical address or region"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
            />
          </div>

          <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-900 dark:text-slate-200">
                Immediate Activation
              </div>
              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                Enable operations upon deployment
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                className="sr-only peer"
                aria-label="Immediate activation"
              />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer-checked:bg-blue-600 relative transition-colors">
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    form.active ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </label>
          </div>
        </form>
      </div>

      {/* Slim Footer */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={isSaving}
            className="flex-1 py-3 bg-slate-900 dark:bg-blue-600 text-white rounded-xl text-[12px] font-bold tracking-widest uppercase hover:bg-slate-800 dark:hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none flex justify-center items-center gap-2"
            aria-label="Deploy branch"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Deploying...</span>
              </>
            ) : (
              "Deploy Branch"
            )}
          </button>

          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default BranchProvisionPanel;
