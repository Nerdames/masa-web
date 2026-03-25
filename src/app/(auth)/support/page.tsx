"use client";

import React, { useState, FC, ReactNode, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { PreferenceScope, NotificationType } from "@prisma/client";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

// --- Types & Enhanced Data Structure ---

interface FAQItem {
  question: string;
  answer: ReactNode;
}

interface FAQSection {
  id: string;
  category: string;
  title: string;
  icon: string;
  badgeScope: PreferenceScope | "SYSTEM";
  items: FAQItem[];
}

const FAQ_CONTENT: FAQSection[] = [
  {
    id: "core-architecture",
    category: "Foundation",
    title: "The Fortress Protocol",
    icon: "bx-shield-alt-2",
    badgeScope: "SYSTEM",
    items: [
      { 
        question: "What is the 'Fortress' principle?", 
        answer: "The Fortress principle ensures data integrity through immutability. Once a transaction (Sale or Stock Movement) is finalized, it cannot be edited—only reversed with a documented 'Void' event to maintain a 100% auditable ledger." 
      },
      { 
        question: "Why can't I edit stock levels directly?", 
        answer: "MASA uses Event-Driven Inventory. Current stock levels are calculated in real-time by summing all historical 'IN', 'OUT', and 'ADJUST' movements. This prevents 'ghost' inventory and manual manipulation errors." 
      }
    ]
  },
  {
    id: "getting-started",
    category: "Onboarding",
    title: "Platform Deployment",
    icon: "bx-rocket",
    badgeScope: PreferenceScope.ORGANIZATION,
    items: [
      { question: "How do I initialize my Organization?", answer: "After authentication, navigate to 'System Settings' to define your base currency, tax types (VAT/Sales Tax), and fiscal start date." },
      { question: "Can I deploy multi-region branches?", answer: "Yes. Each branch can be assigned specific personnel and local stock pools, while remaining under the centralized governance of the Organization." },
      { question: "What are 'Branch Codes'?", answer: "Branch codes (e.g., BR-NY-01) are unique identifiers used for inter-branch transfers and localized reporting." }
    ]
  },
  {
    id: "identity-access",
    category: "Security",
    title: "Access Control (RBAC)",
    icon: "bx-lock-open",
    badgeScope: PreferenceScope.USER,
    items: [
      { question: "What roles are available?", answer: "The system supports ADMIN (Full Control), MANAGER (Branch Ops), SALES (Invoicing), INVENTORY (Stock Control), CASHIER (Payments), and AUDITOR (Read-only Compliance)." },
      { question: "How does OTP verification work?", answer: "Sensitive actions or first-time logins require a One-Time Password sent to your registered personnel email to verify identity before a session token is issued." },
      { question: "Can I restrict staff to specific branches?", answer: "Yes. Personnel can be assigned to 'Global' access or restricted to one or more specific branches via the Personnel Management interface." }
    ]
  },
  {
    id: "sales-ops",
    category: "Operations",
    title: "Sales & Invoicing",
    icon: "bx-cart-alt",
    badgeScope: PreferenceScope.BRANCH,
    items: [
      { question: "What is a 'Draft Sale'?", answer: "Draft sales allow staff to build an order without affecting inventory. Once 'Finalized', the system generates an immutable Sale record and triggers an automatic 'OUT' stock movement." },
      { question: "How are refunds handled?", answer: "Refunds are processed as 'Reversed Sales'. The system creates a linked refund transaction and returns the specific items to stock via an 'IN' movement event." }
    ]
  },
  {
    id: "audit-logs",
    category: "Compliance",
    title: "Audit & Traceability",
    icon: "bx-fingerprint",
    badgeScope: "SYSTEM",
    items: [
      { question: "Where can I see system changes?", answer: "Every user interaction is logged in the 'Activity Log'. This includes login attempts, role updates, and critical operational shifts." },
      { question: "What is a 'Critical Action'?", answer: "Any action that alters the financial or structural state of the organization (e.g., voiding a sale, changing permissions) is flagged as 'Critical' for immediate auditor review." }
    ]
  }
];

// --- Sub-Components ---

const CollapseSection: FC<{
  section: FAQSection;
  expanded: boolean;
  onToggle: () => void;
}> = ({ section, expanded, onToggle }) => {
  const getIndicatorColor = (scope: string) => {
    switch (scope) {
      case PreferenceScope.USER: return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
      case PreferenceScope.BRANCH: return "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]";
      case PreferenceScope.ORGANIZATION: return "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]";
      default: return "bg-slate-400";
    }
  };

  return (
    <div className={`mb-4 transition-all duration-500 rounded-2xl border ${expanded ? "bg-white border-blue-200 shadow-2xl shadow-blue-900/5 scale-[1.01]" : "bg-white/60 border-transparent hover:border-slate-200"}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-6 text-left group">
        <div className="flex items-center gap-5">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${expanded ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"}`}>
            <i className={`bx ${section.icon} text-2xl`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">{section.category}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${getIndicatorColor(section.badgeScope)}`} />
            </div>
            <span className={`text-sm font-black uppercase tracking-wider transition-colors ${expanded ? "text-blue-600" : "text-slate-700 group-hover:text-slate-900"}`}>
              {section.title}
            </span>
          </div>
        </div>
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${expanded ? "rotate-90 border-blue-200 text-blue-500" : "border-slate-200 text-slate-300"}`}>
          <i className="bx bx-chevron-right text-xl" />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}>
            <div className="px-8 pb-8 pt-0   text-[13px] text-slate-500 leading-relaxed font-medium">
              <div className="h-px w-full bg-gradient-to-r from-blue-100 via-blue-50 to-transparent mb-6" />
              <div className="space-y-6">
                {section.items.map((item, index) => (
                  <div key={index} className="group/item">
                    <p className="font-black text-slate-800 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-sm bg-blue-500/30 group-hover/item:bg-blue-500 transition-colors" />
                      {item.question}
                    </p>
                    <p className="text-slate-600 pl-4 border-l-2 border-slate-100 py-1 ml-0.5">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main Page Component ---

export default function SupportPage() {
  const { dispatch } = useAlerts();
  const [expandedId, setExpandedId] = useState<string | null>("core-architecture");
  const [isSending, setIsSending] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const [formData, setFormData] = useState({
    email: "",
    orgId: "",
    message: "",
    subject: "Technical Issue"
  });

  // Dynamic Search Logic
  const filteredFaqs = useMemo(() => {
    if (!searchQuery) return FAQ_CONTENT;
    const query = searchQuery.toLowerCase();
    return FAQ_CONTENT.filter(section => 
      section.title.toLowerCase().includes(query) || 
      section.items.some(i => i.question.toLowerCase().includes(query) || (typeof i.answer === 'string' && i.answer.toLowerCase().includes(query)))
    );
  }, [searchQuery]);

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[MASA HELP] ${formData.subject}`,
          message: formData.message,
          type: NotificationType.INFO,
          metadata: {
            guestEmail: formData.email,
            organizationId: formData.orgId,
            source: "PUBLIC_PORTAL",
            timestamp: new Date().toISOString()
          }
        }),
      });

      if (!res.ok) throw new Error();

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Transmission Complete",
        message: "Your enquiry has been securely logged."
      });

      setFormData(prev => ({ ...prev, message: "" }));
    } catch {
      dispatch({ kind: "TOAST", type: "ERROR", title: "System Error", message: "Failed to dispatch to MASA Support." });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans relative overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-50/50 to-transparent z-0 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header Section */}
<div className="flex flex-col md:flex-row md:items-center justify-between mb-10 pb-6 border-b border-slate-100 gap-6">
  {/* Left: Branding & Navigation */}
  <div className="flex items-center gap-5">
    <Link 
      href="/signin" 
      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm transition-all group"
    >
      <i className="bx bx-left-arrow-alt text-xl group-hover:-translate-x-0.5 transition-transform" />
    </Link>

    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-black tracking-tighter text-slate-900 uppercase">
          MASA <span className="text-blue-600">Help Center</span>
        </h1>
        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold tracking-widest">
          v2.0
        </span>
      </div>
      <p className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-[0.2em]">
        Standard Operating Procedures
      </p>
    </div>
  </div>
  
  {/* Right: Status & Clock */}
  <div className="flex items-center gap-4 bg-white/50 px-4 py-2 rounded-2xl border border-slate-100">
    <div className="text-right border-r border-slate-100 pr-4">
      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Station Clock</p>
      <p className="text-xs font-mono font-bold text-slate-700 tabular-nums">{currentTime} UTC</p>
    </div>
    
    <div className="flex items-center gap-2.5 pl-1">
      <div className="relative flex items-center justify-center">
        <div className="w-2 h-2 bg-emerald-500 rounded-full" />
        <div className="absolute w-2 h-2 bg-emerald-500 rounded-full animate-ping opacity-40" />
      </div>
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
        Gateway Active
      </span>
    </div>
  </div>
</div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
          {/* KB Section */}
          <div className="lg:col-span-7 space-y-8">
            {/* Search Bar */}
            <div className="relative group">
              <i className="bx bx-search absolute left-6 top-1/2 -translate-y-1/2 text-xl text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search protocols (e.g. 'Inventory', 'RBAC', 'Fortress')..." 
                className="w-full bg-white border border-slate-200 rounded-2xl py-5 pl-14 pr-6 text-sm font-medium outline-none focus:border-blue-500 focus:shadow-xl focus:shadow-blue-900/5 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              {filteredFaqs.length > 0 ? (
                filteredFaqs.map(section => (
                  <CollapseSection 
                    key={section.id} 
                    section={section} 
                    expanded={expandedId === section.id} 
                    onToggle={() => setExpandedId(expandedId === section.id ? null : section.id)} 
                  />
                ))
              ) : (
                <div className="py-20 text-center">
                  <i className="bx bx-info-circle text-4xl text-slate-200 mb-4" />
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No matching protocols found</p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Console */}
          <div className="lg:col-span-5 lg:sticky lg:top-12">
            <div className="bg-white rounded-2xl p-1 shadow-xl shadow-blue-900/20">
              <div className="bg-white rounded-xl overflow-hidden">
                <div className="p-10 bg-slate-900 text-white relative overflow-hidden">
                  <div className="relative z-10">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-blue-400 mb-2">System Support Console</h3>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">
                      {isSending ? "Status: Transmitting Packet..." : "Status: Ready for Input"}
                    </p>
                  </div>
                  <i className="bx bx-shield-quarter absolute -right-4 -bottom-4 text-8xl text-white/5 rotate-12" />
                </div>

                <form onSubmit={handleSupportSubmit} className="p-10 space-y-7">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Enquiry Vector</label>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className="w-full flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-black text-slate-700 outline-none hover:bg-slate-100 transition-all">
                          {formData.subject} <i className="bx bx-chevron-down text-xl opacity-30" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="w-[var(--radix-dropdown-menu-trigger-width)] bg-white p-2 rounded-2xl shadow-2xl border border-slate-100 z-[100] animate-in fade-in zoom-in-95">
                          {["Technical Issue", "Billing Inquiry", "Account Lockout", "Feature Request", "Bug Report"].map(subject => (
                            <DropdownMenu.Item key={subject} onSelect={() => setFormData({...formData, subject})}
                              className="p-4 text-[10px] font-black uppercase tracking-wider rounded-2xl cursor-pointer hover:bg-slate-900 hover:text-white outline-none transition-all">
                              {subject}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Personnel Email</label>
                      <input required type="email" placeholder="id@org.masa" 
                        className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-bold outline-none focus:border-blue-500 transition-all placeholder:text-slate-300"
                        value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Org Code</label>
                      <input type="text" placeholder="MS-XXXX" 
                        className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-mono font-bold outline-none focus:border-blue-500 transition-all placeholder:text-slate-300 uppercase"
                        value={formData.orgId} onChange={e => setFormData({...formData, orgId: e.target.value})} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Diagnostic Details</label>
                    <textarea required rows={4} placeholder="Include order IDs or specific error codes..." 
                      className="w-full p-5 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-medium outline-none focus:border-blue-500 transition-all resize-none placeholder:text-slate-300"
                      value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} />
                  </div>

                  <button disabled={isSending} type="submit" 
                    className="w-full py-6 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.5em] hover:bg-blue-600 transition-all active:scale-[0.98] disabled:opacity-50 relative group overflow-hidden">
                    <span className="relative z-10 flex items-center justify-center gap-4">
                      {isSending ? <i className="bx bx-loader-alt animate-spin text-xl" /> : <i className="bx bx-paper-plane text-xl" />}
                      {isSending ? "DISPATCHING..." : "SECURE DISPATCH"}
                    </span>
                    <div className="absolute inset-0 bg-blue-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out" />
                  </button>
                  
                  <div className="flex items-center justify-center gap-3 opacity-30">
                    <i className="bx bxs-check-shield text-xl" />
                    <p className="text-[8px] font-mono font-bold uppercase tracking-[0.3em]">AES-256 Encrypted Tunnel</p>
                  </div>
                </form>
              </div>
            </div>
            
            <p className="mt-8 text-[10px] font-bold text-slate-400 text-center leading-relaxed px-10">
              For immediate critical infrastructure failure, contact the <span className="text-slate-600">Site Reliability Engineer</span> directly via the internal emergency channel.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}