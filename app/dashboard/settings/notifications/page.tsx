"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Preference, PreferenceScope } from "@prisma/client";

import { SettingsGroup } from "@/components/ui/SettingsGroup";
import CollapseSection from "@/components/ui/CollapseSection";
import { useToast } from "@/components/feedback/ToastProvider";
import AccessDenied from "@/components/feedback/AccessDenied";

/* ---------------------------- CONFIG ---------------------------- */

const NOTIFICATION_KEYS = [
  { key: "sales_alerts", label: "Sales & Invoices", description: "Real-time updates on new orders and payments" },
  { key: "inventory_alerts", label: "Inventory & Stock", description: "Low stock warnings and adjustment logs" },
  { key: "security_alerts", label: "Security & Access", description: "Login attempts and permission changes" },
  { key: "approval_alerts", label: "Approval Requests", description: "Tasks requiring manager or admin sign-off" },
];

const CHANNELS = [
  { key: "email", label: "Email", icon: "bx-envelope" },
  { key: "inApp", label: "In-App", icon: "bx-bell" },
  { key: "sms", label: "SMS", icon: "bx-mobile-vibration" },
] as const;

type ChannelKey = typeof CHANNELS[number]["key"];
type RoutingValue = Record<ChannelKey, boolean>;

/* ---------------------------- PAGE ---------------------------- */

export default function NotificationSettingsPage() {
  const { data: session, status } = useSession();
  const { addToast } = useToast();

  const [currentScope, setCurrentScope] = useState<PreferenceScope>("USER");
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAuthority, setExpandedAuthority] = useState<Record<string, boolean>>({});

  const isAdmin = session?.user?.isOrgOwner || session?.user?.role === "ADMIN" || session?.user?.role === "DEV";
  const isManager = session?.user?.role === "MANAGER";

  /* ---------------- FETCH ---------------- */

  useEffect(() => {
    if (status !== "authenticated") return;

    async function loadEngine() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/preferences?category=NOTIFICATION&all=true");
        const data = await res.json();
        if (data.success) {
          setPreferences(data.preferences);
          // Assuming a specific key for system-wide pause
          const pausePref = data.preferences.find((p: Preference) => p.key === "notification_pause" && p.scope === currentScope);
          setIsPaused(pausePref?.value === true);
        }
      } catch (err) {
        addToast({ type: "error", title: "Sync Error", message: "Failed to load notification engine." });
      } finally {
        setIsLoading(false);
      }
    }

    loadEngine();
  }, [status, currentScope, addToast]);

  /* ---------------- HIERARCHY RESOLUTION ---------------- */

  const resolveRouting = (key: string) => {
    const find = (s: PreferenceScope) => preferences.find(p => p.key === key && p.scope === s);
    
    const userPref = find("USER");
    const branchPref = find("BRANCH");
    const orgPref = find("ORGANIZATION");

    const defaultValue: RoutingValue = { email: false, inApp: true, sms: false };

    // Hierarchy: User > Branch > Org > Default
    const activeValue = (userPref?.value ?? branchPref?.value ?? orgPref?.value ?? defaultValue) as RoutingValue;

    let activeScope: PreferenceScope | "DEFAULT" = "DEFAULT";
    if (userPref) activeScope = "USER";
    else if (branchPref) activeScope = "BRANCH";
    else if (orgPref) activeScope = "ORGANIZATION";

    return { userPref, branchPref, orgPref, activeValue, activeScope };
  };

  /* ---------------- SAVE ---------------- */

  const handleUpdate = async (key: string, value: RoutingValue, scope: PreferenceScope) => {
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, scope, category: "NOTIFICATION" }),
    });

    if (res.ok) {
      const data = await res.json();
      setPreferences(prev => [
        ...prev.filter(p => !(p.key === key && p.scope === scope)),
        data.preference
      ]);
      addToast({ type: "success", title: "Policy Updated", message: `Saved to ${scope} level.` });
    }
  };

  if (status === "loading" || isLoading) return <CenteredMessage>Syncing Notification Engine…</CenteredMessage>;
  if (!session) return <AccessDenied />;

  return (
    <div className="max-w-[850px] mx-auto py-12 px-6 pb-32">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black/[0.03] pb-10">
        <div>
          <h1 className="text-2xl font-black text-black/90 tracking-tight italic">Notification Engine</h1>
          <p className="text-[13px] text-black/40">Route system alerts across delivery channels and authority levels.</p>
        </div>

        <div className="flex items-center gap-1 bg-black/[0.04] p-1 rounded-2xl border border-black/[0.02]">
          {(["USER", "BRANCH", "ORGANIZATION"] as PreferenceScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setCurrentScope(s)}
              className={`px-4 py-2 text-[10px] font-black rounded-xl transition-all ${
                currentScope === s ? "bg-white shadow-md text-blue-600" : "text-black/30 hover:text-black/50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-10">
        <SettingsGroup header="System Status" icon="bx-shield-quarter">
          <div className="p-6 flex items-center justify-between bg-red-50/30 rounded-2xl border border-red-100/50">
            <div>
              <div className="text-[12px] font-black text-red-600 uppercase tracking-widest">Master Delivery Pause</div>
              <p className="text-[11px] text-black/40">Silence all outgoing alerts for the current scope.</p>
            </div>
            <Switch checked={isPaused} onChange={() => setIsPaused(!isPaused)} color="bg-red-500" />
          </div>
        </SettingsGroup>

        <SettingsGroup header="Channel Routing" icon="bx-git-repo-forked" count={NOTIFICATION_KEYS.length}>
          <div className="divide-y divide-black/[0.02]">
            {NOTIFICATION_KEYS.map((item) => {
              const { activeValue, activeScope, branchPref, orgPref } = resolveRouting(item.key);
              const hasAuthority = branchPref ? "BRANCH" : (orgPref ? "ORGANIZATION" : "DEFAULT");

              return (
                <div key={item.key} className="flex flex-col">
                  <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-bold text-black/80">{item.label}</h3>
                        <ScopeBadge scope={activeScope} />
                      </div>
                      <p className="text-[11px] text-black/40 max-w-sm">{item.description}</p>
                    </div>

                    <div className="flex gap-2">
                      {CHANNELS.map((chan) => (
                        <ChannelChip
                          key={chan.key}
                          label={chan.label}
                          icon={chan.icon}
                          active={activeValue[chan.key]}
                          disabled={isPaused}
                          onClick={() => {
                            const next = { ...activeValue, [chan.key]: !activeValue[chan.key] };
                            handleUpdate(item.key, next, currentScope);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {(isAdmin || isManager) && (
                    <div className="px-6 pb-6">
                      <CollapseSection 
                        title="Authority Policy" 
                        badgeScope={hasAuthority}
                        expanded={!!expandedAuthority[item.key]}
                        onToggle={() => setExpandedAuthority(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                      >
                        <div className="pt-4 space-y-4">
                          <AuthorityRow 
                            label="Branch Policy" 
                            value={(branchPref?.value as RoutingValue) ?? (orgPref?.value as RoutingValue) ?? { email: false, inApp: true, sms: false }}
                            onUpdate={(val) => handleUpdate(item.key, val, "BRANCH")}
                          />
                          {isAdmin && (
                            <AuthorityRow 
                              label="Org Global" 
                              value={(orgPref?.value as RoutingValue) ?? { email: false, inApp: true, sms: false }}
                              onUpdate={(val) => handleUpdate(item.key, val, "ORGANIZATION")}
                            />
                          )}
                        </div>
                      </CollapseSection>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SettingsGroup>
      </div>
    </div>
  );
}

/* ---------------- SUB COMPONENTS ---------------- */

function AuthorityRow({ label, value, onUpdate }: { label: string; value: RoutingValue; onUpdate: (val: RoutingValue) => void }) {
  return (
    <div className="flex items-center justify-between bg-black/[0.02] p-3 rounded-xl border border-black/[0.01]">
      <span className="text-[11px] font-bold text-black/50 uppercase tracking-tight">{label}</span>
      <div className="flex gap-1.5">
        {CHANNELS.map(chan => (
          <button
            key={chan.key}
            onClick={() => onUpdate({ ...value, [chan.key]: !value[chan.key] })}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${value[chan.key] ? 'bg-white shadow-sm text-blue-600' : 'text-black/20 hover:text-black/40'}`}
          >
            <i className={`bx ${chan.icon} text-sm`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  if (scope === "DEFAULT") return null;
  const colors = {
    USER: "bg-blue-100 text-blue-600",
    BRANCH: "bg-amber-100 text-amber-600",
    ORGANIZATION: "bg-purple-100 text-purple-600",
  };
  return (
    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${colors[scope as keyof typeof colors]}`}>
      {scope}
    </span>
  );
}

function ChannelChip({ label, icon, active, onClick, disabled }: { label: string; icon: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${
        active ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-black/[0.06] text-black/30"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "active:scale-95 shadow-sm"}`}
    >
      <i className={`bx ${icon} text-base`} />
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function Switch({ checked, onChange, color = "bg-blue-600" }: { checked: boolean; onChange: () => void; color?: string }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full relative p-1 transition-colors ${checked ? color : "bg-black/10"}`}
    >
      <motion.div
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="w-4 h-4 bg-white rounded-full shadow-lg"
      />
    </button>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[70vh] items-center justify-center text-[11px] font-black uppercase tracking-[0.4em] text-black/20 italic animate-pulse">
      {children}
    </div>
  );
}