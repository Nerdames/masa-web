"use client";

import React, { useState, FC, ReactNode, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { PreferenceScope, CriticalAction, NotificationType } from "@prisma/client";
import { useAlerts } from "@/components/feedback/AlertProvider";

// --- Types & Data ---

interface FAQItem {
  question: string;
  answer: ReactNode;
}

interface FAQSection {
  id: string;
  category: string;
  title: string;
  badgeScope: PreferenceScope | "DEFAULT";
  items: FAQItem[];
}

const FAQ_CONTENT: FAQSection[] = [
  {
    id: "getting-started",
    category: "Step 1",
    title: "Getting Started",
    badgeScope: "ORGANIZATION",
    items: [
      { question: "What is MASA?", answer: "MASA is a business management platform that helps you manage branches, personnel, inventory, and sales operations in one central system." },
      { question: "How do I create an organization?", answer: "After signing up, just head to your dashboard. You'll be prompted to enter your organization name and basic info to get up and running." },
      { question: "Can I have multiple branches?", answer: "Absolutely. MASA is built for growth—you can manage multiple locations, each with its own dedicated staff and stock." },
      { question: "Do I need to be a 'techie'?", answer: "Not at all. We've designed the interface to be intuitive for everyone, regardless of technical background." }
    ]
  },
  {
    id: "accounts",
    category: "Identity",
    title: "Accounts & Access",
    badgeScope: "USER",
    items: [
      { question: "How do I create an account?", answer: "Sign up with your email, set a password, and verify your account via the link we send to your inbox." },
      { question: "Forgot my password?", answer: "No worries. Click 'Forgot Password' on the login screen, and we'll send you reset instructions." },
      { question: "Can I change my email?", answer: "Yes, you can update this in your account settings. You'll just need to verify the new address for security." }
    ]
  },
  {
    id: "roles",
    category: "Team",
    title: "Roles & Permissions",
    badgeScope: "DEFAULT",
    items: [
      { question: "Who handles what?", answer: "We use 'Role-Based Access'. This means users only see what they need. Roles include Admin, Manager, Sales, Inventory, Cashier, and Dev." },
      { question: "What can an Admin do?", answer: "Admins have full keys to the kingdom—managing branches, personnel roles, and system-wide settings." },
      { question: "Can roles be changed?", answer: "Yes. Admins can promote or reassign personnel at any time as your team grows." }
    ]
  },
  {
    id: "org-branches",
    category: "Structure",
    title: "Organizations & Branches",
    badgeScope: "BRANCH",
    items: [
      { question: "What’s the difference?", answer: "The 'Organization' is your entire business entity. 'Branches' are the physical locations or units underneath it." },
      { question: "Can staff work at multiple branches?", answer: "Yes, depending on the permissions you set, staff can be assigned to one or multiple locations." }
    ]
  },
  {
    id: "personnel",
    category: "Staff",
    title: "Personnel Management",
    badgeScope: "USER",
    items: [
      { question: "How do I add staff?", answer: "Admins or Managers can invite team members by entering their email and picking a role. They'll get an invite link instantly." },
      { question: "Can I deactivate accounts?", answer: "Yes. If someone leaves the team, you can deactivate their account to keep your data secure." }
    ]
  },
  {
    id: "inventory",
    category: "Stock",
    title: "Inventory Management",
    badgeScope: "BRANCH",
    items: [
      { question: "How do I add products?", answer: "Navigate to the Inventory section and click 'Add Product'. You can track items by branch to know exactly what is where." },
      { question: "Does it track movements?", answer: "Yes. Every time stock is added, sold, or adjusted, MASA logs it so you have a perfect audit trail." }
    ]
  },
  {
    id: "sales",
    category: "Sales",
    title: "Sales Management",
    badgeScope: "BRANCH",
    items: [
      { question: "How are sales recorded?", answer: "Sales staff use the Sales module to select products and quantities. Everything is logged in real-time." },
      { question: "Can I see reports?", answer: "Definitely. You can filter sales performance by date, branch, or product to see how the business is doing." }
    ]
  },
  {
    id: "security",
    category: "Security",
    title: "Security & Protection",
    badgeScope: "ORGANIZATION",
    items: [
      { question: "Is my data safe?", answer: "We use encrypted connections and strict permission controls to ensure only authorized eyes see your business data." },
      { question: "What are 'Critical Actions'?", answer: "Sensitive moves—like role changes or email updates—are flagged as 'Critical' and logged permanently for accountability." }
    ]
  },
  {
    id: "troubleshooting",
    category: "Help",
    title: "Troubleshooting",
    badgeScope: "DEFAULT",
    items: [
      { question: "Why can't I log in?", answer: "Check for typos, ensure your email is verified, or contact your admin to see if your account is active." },
      { question: "Feature is missing?", answer: "If you can't see a button or page, your current Role might not have permission for it. Check with your Admin." }
    ]
  },
  {
    id: "policies",
    category: "Legal",
    title: "Policies",
    badgeScope: "ORGANIZATION",
    items: [
      { question: "Can I delete my account?", answer: "Yes. Reach out to support to handle account deletions and data export requests." },
      { question: "Is data backed up?", answer: "Yes, we maintain secure, redundant backups so your business history is never lost." }
    ]
  }
];

const CollapseSection: FC<{
  section: FAQSection;
  expanded: boolean;
  onToggle: () => void;
}> = ({ section, expanded, onToggle }) => {
  const getIndicatorColor = (scope: string) => {
    switch (scope) {
      case "USER": return "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
      case "BRANCH": return "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]";
      case "ORGANIZATION": return "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]";
      default: return "bg-slate-300";
    }
  };

  return (
    <div className={`mb-3 transition-all duration-300 rounded-2xl border ${expanded ? "bg-white border-blue-100 shadow-xl shadow-blue-900/5" : "bg-white/50 border-transparent hover:border-slate-200"}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left group">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-mono font-bold text-slate-400 mb-1">{section.category}</span>
            <div className={`w-1 h-1 rounded-full ${getIndicatorColor(section.badgeScope)}`} />
          </div>
          <span className={`text-xs font-black uppercase tracking-wider transition-colors ${expanded ? "text-blue-600" : "text-slate-600 group-hover:text-slate-900"}`}>
            {section.title}
          </span>
        </div>
        <i className={`bx bx-chevron-right text-xl transition-transform duration-300 ${expanded ? "rotate-90 text-blue-500" : "text-slate-300"}`} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-12 pb-6 pt-0 text-[13px] text-slate-500 leading-relaxed font-medium">
              <div className="h-px w-full bg-gradient-to-r from-blue-50 to-transparent mb-4" />
              {section.items.map((item, index) => (
                <div key={index} className="mb-4">
                  <p className="font-bold text-slate-800 mb-1">{item.question}</p>
                  <p className="text-slate-600 pl-3 border-l-2 border-slate-100">{item.answer}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


export default function SupportPage() {

  const { dispatch } = useAlerts();
  const [expandedId, setExpandedId] = useState<string | null>("getting-started");
  const [isSending, setIsSending] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [formData, setFormData] = useState({
    email: "",
    orgId: "",
    message: "",
    subject: "Technical Issue"
  });

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
          type: "INFO",
          metadata: {
            guestEmail: formData.email,
            organizationId: formData.orgId,
            source: "PUBLIC_PORTAL"
          }
        }),
      });

      if (!res.ok) throw new Error();

      dispatch({
        kind: "TOAST",
        type: "SUCCESS",
        title: "Transmission Complete",
        message: "Request logged in ActivityLog."
      });

      setFormData(prev => ({ ...prev, message: "" }));

    } catch {
      dispatch({
        kind: "TOAST",
        type: "ERROR",
        title: "System Error",
        message: "Failed to communicate with MASA Support."
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F7F9] text-slate-900 font-sans relative overflow-y-auto">
      <div className="absolute inset-0 z-0 opacity-[0_0.03] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-12 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-6">
            <Link href="/auth/signin" className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all group">
              <i className="bx bx-left-arrow-alt text-2xl group-hover:-translate-x-0.5 transition-transform" />
            </Link>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase">
                MASA <span className="text-blue-600">Help Center</span>
              </h1>
              <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Operations Knowledge Base
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">System Clock</p>
              <p className="text-xs font-mono font-bold text-slate-700 uppercase tracking-tighter">{currentTime} UTC</p>
            </div>
            <div className="h-10 w-px bg-slate-200" />
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Audit: Active</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <i className="bx bx-book-content" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
                Knowledge Base & Protocols
              </h2>
            </div>
            {FAQ_CONTENT.map(section => (
              <CollapseSection 
                key={section.id} 
                section={section} 
                expanded={expandedId === section.id} 
                onToggle={() => setExpandedId(expandedId === section.id ? null : section.id)} 
              />
            ))}
          </div>

          <div className="lg:col-span-5 sticky top-10 self-start">
            <div className="bg-slate-900 rounded-[2.5rem] p-1 shadow-2xl shadow-blue-900/20">
              <div className="bg-white rounded-[2.3rem] overflow-hidden">
                <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-blue-400 mb-1">Support Console</h3>
                    <p className="text-[11px] font-mono text-slate-400 uppercase tracking-tighter">Status: {isSending ? "Transmitting..." : "Awaiting Input"}</p>
                  </div>
                  <i className="bx bx-shield-quarter text-3xl text-blue-500/50" />
                </div>

                <form onSubmit={handleSupportSubmit} className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Context Identifier</label>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs font-black text-slate-700 outline-none hover:bg-slate-100 transition-colors">
                          {formData.subject} <i className="bx bx-chevron-down text-xl opacity-30" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="w-[var(--radix-dropdown-menu-trigger-width)] bg-white p-2 rounded-2xl shadow-2xl border border-slate-100 z-50">
                          {["Technical Issue", "Billing Inquiry", "Account Access", "General Feedback"].map(subject => (
                            <DropdownMenu.Item key={subject} onSelect={() => setFormData({...formData, subject})}
                              className="p-3 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer hover:bg-blue-600 hover:text-white outline-none transition-all">
                              {subject}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Personnel Email</label>
                      <input required type="email" placeholder="user@org.app" 
                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-bold outline-none focus:border-blue-500 transition-all placeholder:opacity-30"
                        value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Org Code</label>
                      <input type="text" placeholder="MS-XXXX" 
                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-mono font-bold outline-none focus:border-blue-500 transition-all placeholder:opacity-30"
                        value={formData.orgId} onChange={e => setFormData({...formData, orgId: e.target.value})} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Log Report Detail</label>
                    <textarea required rows={5} placeholder="Include transaction IDs or specific error codes for faster resolution..." 
                      className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-medium outline-none focus:border-blue-500 transition-all resize-none placeholder:opacity-30"
                      value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} />
                  </div>

                  <button disabled={isSending} type="submit" 
                    className="w-full py-5 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.3em] hover:bg-blue-600 transition-all active:scale-[0.98] disabled:opacity-50 relative group">
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      {isSending ? <i className="bx bx-loader-alt animate-spin text-lg" /> : <i className="bx bx-paper-plane text-lg" />}
                      {isSending ? "LOGGING ENQUIRY..." : "DISPATCH TO HELPDESK"}
                    </span>
                    <div className="absolute inset-0 bg-blue-600 rounded-2xl scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                  </button>
                  <p className="text-[9px] text-center font-mono font-bold text-slate-300 uppercase">Communication Encrypted & Logged</p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}