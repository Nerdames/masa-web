"use client";

import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAlerts } from "@/core/components/feedback/AlertProvider"; // Adjust path
import { Role } from "@prisma/client";

/**
 * Enhanced Subject Mapping
 */
const ADMIN_SUBJECTS = [
  { id: "USER_LOCK_UNLOCK", label: "Account Lockout Issue", type: "SECURITY" },
  { id: "BRANCH_TRANSFER", label: "Branch Transfer Request", type: "SYSTEM" },
  { id: "PERMISSION_UPGRADE", label: "Role/Permission Upgrade", type: "SECURITY" },
  { id: "VOID_INVOICE", label: "Request Invoice Void", type: "WARNING" },
  { id: "OTHER", label: "Other Administrative Issue...", type: "INFO" },
];

const DEV_SUBJECTS = [
  { id: "SYSTEM_BUG", label: "Report a System Bug", type: "ERROR" },
  { id: "FEATURE_REQUEST", label: "Request a New Feature", type: "SYSTEM" },
  { id: "PERFORMANCE", label: "System Slowness/Lag", type: "WARNING" },
  { id: "OTHER", label: "Other Technical Issue...", type: "INFO" },
];

interface SupportFormProps {
  user: {
    id: string;
    name: string;
    role: Role;
    organizationId: string;
    branchId: string | null;
    isAdmin: boolean;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

export default function SupportForm({ user, onSuccess, onCancel }: SupportFormProps) {
  const { dispatch } = useAlerts();
  const options = user.isAdmin ? DEV_SUBJECTS : ADMIN_SUBJECTS;

  const [subjectId, setSubjectId] = useState(options[0].id);
  const [customSubject, setCustomSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedOption = options.find((o) => o.id === subjectId);
  const currentLabel = selectedOption?.label || "Select Category";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    const finalSubject = subjectId === "OTHER" ? customSubject : currentLabel;

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: finalSubject,
          message,
          type: selectedOption?.type || "INFO",
          actionKey: subjectId,
          metadata: {
            userName: user.name,
            userRole: user.role,
            branchId: user.branchId,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to deliver request");
      }

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Ticket Submitted",
        message: user.isAdmin
          ? "The technical team has been notified of this bug."
          : "Your request has been routed to system administrators.",
      });

      onSuccess();
      setMessage("");
      setCustomSubject("");
    } catch (error: unknown) {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "Submission Failed",
        message: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-transparent p-4 relative">
      {/* CLOSE PANEL BUTTON */}
          <button onClick={onCancel}         className="absolute top-4 right-4 w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all active:scale-90" aria-label="Close panel">
            <i className="bx bx-x text-lg" />
          </button>

      {/* HEADER - Borderless with asymmetric alignment */}
      <div className="pb-6 flex justify-between items-center pr-10">
        <div className="space-y-1">
          <h3 className="font-black text-slate-400 text-[10px] tracking-[0.2em] pt-4 uppercase whitespace-nowrap">
            {user.isAdmin ? "Dev Protocol (L3)" : "System Support (L2)"}
          </h3>
          <p className="text-[11px] text-slate-500 font-medium whitespace-nowrap">Priority Support Channel</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="py-2 space-y-8 text-left">
        {/* CATEGORY SELECTOR */}
        <div className="space-y-3">
          <label className="pl-1 text-[10px] font-black uppercase tracking-widest text-slate-400 block whitespace-nowrap">
            Directed Action Type
          </label>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-slate-100/40 text-sm font-bold text-slate-700 hover:bg-slate-100/60 transition-all outline-none focus:ring-2 focus:ring-slate-900/5"
              >
                <span className="whitespace-nowrap overflow-hidden text-ellipsis">{currentLabel}</span>
                <i className="bx bx-chevron-down text-xl text-slate-400 flex-shrink-0" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={8}
                className="min-w-[280px] bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[100] animate-in fade-in zoom-in-95 duration-150"
              >
                {options.map((opt) => (
                  <DropdownMenu.Item
                    key={opt.id}
                    onSelect={() => setSubjectId(opt.id)}
                    className={`flex items-center px-4 py-3 text-xs rounded-xl cursor-pointer outline-none transition-colors mb-1 last:mb-0 whitespace-nowrap ${
                      subjectId === opt.id
                        ? "bg-slate-900 text-white font-bold"
                        : "text-slate-600 hover:bg-slate-50 font-semibold"
                    }`}
                  >
                    {opt.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {/* CONDITIONAL SUBJECT INPUT */}
        {subjectId === "OTHER" && (
          <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
            <label className="pl-1 text-[10px] font-black uppercase tracking-widest text-slate-400 block whitespace-nowrap">
              Specify Subject
            </label>
            <input
              required
              maxLength={50}
              className="w-full px-5 py-4 rounded-2xl bg-blue-50/40 focus:bg-blue-50/60 outline-none transition-all text-sm font-bold placeholder:text-blue-300"
              placeholder="Brief summary..."
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
            />
          </div>
        )}

        {/* MESSAGE AREA */}
        <div className="space-y-3">
          <label className="pl-1 text-[10px] font-black uppercase tracking-widest text-slate-400 block whitespace-nowrap">
            Detailed Request
          </label>
          <textarea
            required
            rows={5}
            className="w-full px-5 py-4 rounded-2xl bg-slate-100/40 focus:bg-slate-100/60 outline-none transition-all text-sm font-medium resize-none placeholder:text-slate-300 leading-relaxed"
            placeholder="Explain the context..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-6 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors whitespace-nowrap"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={isSending}
            className="flex-[2] py-4 rounded-full text-[11px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-black transition-all disabled:opacity-50 active:scale-[0.98] shadow-xl shadow-slate-200 whitespace-nowrap"
          >
            {isSending ? "Routing..." : "Send Request"}
          </button>
        </div>
      </form>
    </div>
  );
}