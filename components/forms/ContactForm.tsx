"use client";

import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

/**
 * Mapped to your Prisma CriticalAction Enum and Notification logic.
 * The 'id' serves as the actionKey for directed backend logic.
 */
const ADMIN_SUBJECTS = [
  { id: "USER_LOCK_UNLOCK", label: "Account Lockout Issue" },
  { id: "BRANCH_TRANSFER", label: "Branch Transfer Request" },
  { id: "PERMISSION_UPGRADE", label: "Role/Permission Upgrade" },
  { id: "OTHER", label: "Other Administrative Issue..." },
];

const DEV_SUBJECTS = [
  { id: "SYSTEM_BUG", label: "Report a System Bug" },
  { id: "FEATURE_REQUEST", label: "Request a New Feature" },
  { id: "PERFORMANCE", label: "System Slowness/Lag" },
  { id: "OTHER", label: "Other Technical Issue..." },
];

interface ContactFormProps {
  user: {
    id: string;
    organizationId: string;
    branchId: string | null;
    isAdmin: boolean;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ContactForm({ user, onSuccess, onCancel }: ContactFormProps) {
  const options = user.isAdmin ? DEV_SUBJECTS : ADMIN_SUBJECTS;
  
  const [subjectId, setSubjectId] = useState(options[0].id);
  const [customSubject, setCustomSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const currentLabel = options.find(o => o.id === subjectId)?.label || "Select Category";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    // If "OTHER" is selected, we use the custom text limited to 50 chars
    const finalSubject = subjectId === "OTHER" ? customSubject : currentLabel;

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: finalSubject,
          message,
          // Aligns with your NotificationType and Logic flow
          category: user.isAdmin ? "SYSTEM" : "APPROVAL_REQUIRED", 
          metadata: {
            personnelId: user.id,
            organizationId: user.organizationId,
            branchId: user.branchId,
            isAdmin: user.isAdmin,
            actionKey: subjectId, // Used to map to CriticalAction enum on backend
          },
        }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const error = await res.json();
        alert(error.message || "Submission failed");
      }
    } catch (error) {
      console.error("Support submission error:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full border border-slate-100">
      <div className="mb-6">
        <h3 className="text-2xl font-black text-slate-800 tracking-tight">
          {user.isAdmin ? "System Protocol" : "Contact Admin"}
        </h3>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
          {user.isAdmin ? "Dev & Infrastructure" : "Personnel & Branch Support"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* CATEGORY SELECTOR VIA RADIX DROPDOWN */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">
            Directed Action Type
          </label>
          
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <span className={subjectId === "OTHER" && !customSubject ? "text-slate-400" : "text-slate-700"}>
                  {currentLabel}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
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
                        ? "bg-blue-600 text-white font-bold" 
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

        {/* CONDITIONAL SUBJECT INPUT FOR "OTHER" */}
        {subjectId === "OTHER" && (
          <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">
              Specify Subject (Standard Limit)
            </label>
            <input
              required
              maxLength={50}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-blue-50/30 border border-blue-100 focus:border-blue-500 outline-none transition-all text-sm"
              placeholder="e.g. Printer connectivity issue"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
            />
            <div className="flex justify-end pr-1">
              <span className={`text-[9px] font-bold ${customSubject.length >= 50 ? 'text-red-500' : 'text-slate-400'}`}>
                {customSubject.length}/50
              </span>
            </div>
          </div>
        )}

        {/* MESSAGE AREA */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
            Detailed Request
          </label>
          <textarea
            required
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:border-blue-500 outline-none transition-all text-sm resize-none"
            placeholder="Please explain the context of this request..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button 
            type="button" 
            onClick={onCancel} 
            className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={isSending}
            className="flex-1 py-3 rounded-xl text-xs font-black bg-slate-900 text-white hover:bg-blue-600 transition-all disabled:opacity-50 shadow-lg shadow-slate-200"
          >
            {isSending ? "SUBMITTING..." : "SEND PROTOCOL"}
          </button>
        </div>
      </form>
    </div>
  );
}