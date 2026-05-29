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
      case PreferenceScope.USER: return "bg-blue-500 shadow-sm";
      case PreferenceScope.BRANCH: return "bg-amber-500 shadow-sm";
      case PreferenceScope.ORGANIZATION: return "bg-violet-500 shadow-sm";
      default: return "bg-slate-400";
    }
  };

  return (
    <div className={`mb-4 transition-all duration-300 rounded-xl border ${expanded ? "bg-white border-slate-200 shadow-md shadow-slate-100" : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm"}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-5 text-left group">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${expanded ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 group-hover:bg-slate-100"}`}>
            <i className={`bx ${section.icon} text-xl`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-mono font-medium text-slate-400 tracking-wider uppercase">{section.category}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${getIndicatorColor(section.badgeScope)}`} />
            </div>
            <span className={`text-sm font-semibold tracking-tight transition-colors ${expanded ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900"}`}>
              {section.title}
            </span>
          </div>
        </div>
        <div className={`w-7 h-7 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 transition-transform duration-300 ${expanded ? "rotate-90 bg-slate-50 text-slate-600" : "group-hover:bg-slate-50"}`}>
          <i className="bx bx-chevron-right text-lg" />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }}>
            <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed font-normal">
              <div className="h-px w-full bg-slate-100 mb-5" />
              <div className="space-y-5 pl-1">
                {section.items.map((item, index) => (
                  <div key={index} className="space-y-1.5">
                    <p className="font-medium text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                      {item.question}
                    </p>
                    <p className="text-slate-500 pl-3 border-l border-slate-200 ml-0.5 text-[13px]">
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
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 pb-6 border-b border-slate-200 gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/signin" 
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 shadow-sm transition-all"
            >
              <i className="bx bx-left-arrow-alt text-lg" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  MASA Help Center
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-600 font-medium">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Standard Operating Procedures & Documentation
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm w-fit">
            <div className="text-right border-r border-slate-100 pr-3">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Station Clock</p>
              <p className="text-xs font-mono font-semibold text-slate-600 tabular-nums">{currentTime} UTC</p>
            </div>
            
            <div className="flex items-center gap-2 pr-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Active
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* KB Section */}
          <div className="lg:col-span-7 space-y-6">
            <div className="relative">
              <i className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
              <input 
                type="text" 
                placeholder="Search protocols (e.g. 'Inventory', 'RBAC', 'Fortress')..." 
                className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-sm font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400/20 transition-all shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-1">
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
                <div className="py-16 text-center border border-dashed border-slate-200 rounded-xl bg-white/50">
                  <i className="bx bx-info-circle text-3xl text-slate-300 mb-2" />
                  <p className="text-slate-500 font-medium text-sm">No matching protocols found</p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Console */}
          <div className="lg:col-span-5 lg:sticky lg:top-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-900 text-white relative">
                <div className="relative z-10">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-0.5">System Support Console</h3>
                  <p className="text-[11px] font-mono text-slate-500">
                    {isSending ? "Status: Transmitting Packet..." : "Status: Awaiting Input"}
                  </p>
                </div>
                <i className="bx bx-shield-quarter absolute right-4 bottom-2 text-6xl text-white/5" />
              </div>

              <form onSubmit={handleSupportSubmit} className="p-6 space-y-5">
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-medium text-slate-500">Enquiry Vector</label>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button type="button" className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-100 transition-colors">
                        {formData.subject} <i className="bx bx-chevron-down text-lg text-slate-400" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className="w-[var(--radix-dropdown-menu-trigger-width)] bg-white p-1 rounded-lg shadow-lg border border-slate-200 z-[100]">
                        {["Technical Issue", "Billing Inquiry", "Account Lockout", "Feature Request", "Bug Report"].map(subject => (
                          <DropdownMenu.Item key={subject} onSelect={() => setFormData({...formData, subject})}
                            className="p-2.5 text-xs font-medium text-slate-700 rounded-md cursor-pointer hover:bg-slate-50 outline-none transition-colors">
                            {subject}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Personnel Email</label>
                    <input required type="email" placeholder="id@org.masa" 
                      className="w-full p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium outline-none focus:border-slate-400 transition-colors placeholder:text-slate-400"
                      value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Org Code</label>
                    <input type="text" placeholder="MS-XXXX" 
                      className="w-full p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-medium outline-none focus:border-slate-400 transition-colors placeholder:text-slate-400 uppercase"
                      value={formData.orgId} onChange={e => setFormData({...formData, orgId: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Diagnostic Details</label>
                  <textarea required rows={4} placeholder="Include order IDs or specific error codes..." 
                    className="w-full p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium outline-none focus:border-slate-400 transition-colors resize-none placeholder:text-slate-400"
                    value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} />
                </div>

                <button disabled={isSending} type="submit" 
                  className="w-full py-3 rounded-lg bg-slate-900 text-white text-xs font-semibold tracking-wider uppercase hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
                  {isSending ? <i className="bx bx-loader-alt animate-spin text-base" /> : <i className="bx bx-paper-plane text-base" />}
                  {isSending ? "DISPATCHING..." : "SECURE DISPATCH"}
                </button>
                
                <div className="flex items-center justify-center gap-2 text-slate-400 opacity-80 pt-1">
                  <i className="bx bxs-check-shield text-base" />
                  <p className="text-[10px] font-medium uppercase tracking-wider">AES-256 Encrypted Tunnel</p>
                </div>
              </form>
            </div>
            
            <p className="mt-4 text-xs text-slate-400 text-center leading-relaxed px-4">
              For critical infrastructure failure, contact the <span className="text-slate-600 font-medium">Site Reliability Engineer</span> directly via the internal emergency channel.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}