"use client";

import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAlerts } from "@/components/feedback/AlertProvider"; // Adjust path
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

interface ContactFormProps {
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

export default function ContactForm({ user, onSuccess, onCancel }: ContactFormProps) {
  const { dispatch } = useAlerts();
  const options = user.isAdmin ? DEV_SUBJECTS : ADMIN_SUBJECTS;

  const [subjectId, setSubjectId] = useState(options[0].id);
  const [customSubject, setCustomSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedOption = options.find(o => o.id === subjectId);
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

      // 1. Success Feedback (In-App Toast)
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
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-fit">
      {/* HEADER SECTION */}
      <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 text-left flex justify-between items-center">
        <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">
          {user.isAdmin ? "Dev Protocol (L3)" : "System Support (L2)"}
        </h3>
        <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase">
          Priority Channel
        </span>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5 text-left">
        {/* CATEGORY SELECTOR */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
            Directed Action Type
          </label>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
              >
                <span>{currentLabel}</span>
                <i className="bx bx-chevron-down text-lg text-slate-400" />
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
                    className={`flex items-center px-3 py-2.5 text-sm rounded-lg cursor-pointer outline-none transition-colors mb-0.5 last:mb-0 ${
                      subjectId === opt.id 
                        ? "bg-slate-900 text-white font-bold" 
                        : "text-slate-600 hover:bg-slate-50"
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
          <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Specify Subject
            </label>
            <input
              required
              maxLength={50}
              className="w-full px-4 py-3 rounded-xl bg-blue-50/30 border border-blue-100 focus:border-blue-500 outline-none transition-all text-sm font-bold"
              placeholder="Brief summary..."
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
            />
          </div>
        )}

        {/* MESSAGE AREA */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
            Detailed Request
          </label>
          <textarea
            required
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:border-blue-500 outline-none transition-all text-sm font-medium resize-none"
            placeholder="Explain the context..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button 
            type="button" 
            onClick={onCancel} 
            className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={isSending}
            className="flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-blue-600 transition-all disabled:opacity-50 shadow-lg shadow-slate-200 active:scale-[0.98]"
          >
            {isSending ? "Routing..." : "Send Request"}
          </button>
        </div>
      </form>
    </section>
  );
}