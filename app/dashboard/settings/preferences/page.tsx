"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import AccessDenied from "@/components/feedback/AccessDenied";
import CollapseSection from "@/components/ui/CollapseSection";
import { SettingsGroup } from "@/components/ui/SettingsGroup";

/* ---------------------------- TYPES ---------------------------- */

type PreferenceScope = "USER" | "BRANCH" | "ORGANIZATION";
type PreferenceCategory = "UI" | "LAYOUT" | "TABLE" | "NOTIFICATION" | "SYSTEM";
type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

interface Preference {
  key: string;
  value: any;
  target: string | null;
  scope: PreferenceScope;
  category: PreferenceCategory;
}

interface HubSetting {
  key: string;
  label: string;
  description?: string;
  category: PreferenceCategory;
  type: "switch" | "select" | "number" | "text";
  options?: string[];
  target?: string;
}

/* ---------------------------- CONFIG ---------------------------- */

const HUB_SETTINGS: HubSetting[] = [
  { key: "auto_lock_invoices", label: "Auto-Lock Invoices", description: "Prevent editing invoices after they are issued", category: "SYSTEM", type: "switch", target: "Invoice" },
  { key: "stock_approval_threshold", label: "Stock Adjustment Limit", description: "Quantity change requiring MANAGER approval", category: "SYSTEM", type: "number", target: "StockMovement" },
  { key: "default_payment_method", label: "Default Payment", description: "Primary method for new receipts", category: "SYSTEM", type: "select", options: ["CASH", "CARD", "BANK_TRANSFER", "POS"], target: "Payment" },
  { key: "low_stock_threshold", label: "Low Stock Alert", description: "Default reorder level for new branch products", category: "SYSTEM", type: "number", target: "BranchProduct" },

  { key: "notify_approval_requests", label: "Approval Required Alerts", description: "Get notified when critical actions need review", category: "NOTIFICATION", type: "switch" },
  { key: "notify_low_stock", label: "Inventory Warnings", description: "Notify when products hit reorder levels", category: "NOTIFICATION", type: "switch" },
  { key: "email_digest_frequency", label: "Activity Summary", description: "How often to receive activity log reports", category: "NOTIFICATION", type: "select", options: ["Instant", "Daily", "Weekly"] },

  { key: "theme_mode", label: "Interface Theme", description: "Switch between light and dark workspace", category: "UI", type: "select", options: ["System", "Light", "Dark"] },
  { key: "row_density", label: "Table Density", description: "Space between rows in data grids", category: "TABLE", type: "select", options: ["Compact", "Standard", "Relaxed"] },
  { key: "show_cost_price", label: "Reveal Cost Prices", description: "Display product cost prices in inventory lists", category: "UI", type: "switch", target: "Product" },
  { key: "sidebar_collapsed", label: "Minimize Sidebar", description: "More room for data tables", category: "LAYOUT", type: "switch" },
];

/* ---------------------------- SUMMARY TARGETS ---------------------------- */

const SUMMARY_TARGETS = [
  { label: "Dashboard Overview", target: "/dashboard", icon: "bx-home" },
  { label: "Sales Hub", target: "/dashboard/sales", icon: "bx-chart" },
  { label: "Inventory Stock", target: "/dashboard/inventory", icon: "bx-box" },
  { label: "Customer CRM", target: "/dashboard/customers", icon: "bx-group" },
  { label: "Vendor Portal", target: "/dashboard/vendors", icon: "bx-store" },
  { label: "Invoice Management", target: "/dashboard/invoices", icon: "bx-receipt" },
  { label: "Order Tracking", target: "/dashboard/orders", icon: "bx-cart" },
  { label: "Notifications", target: "/dashboard/notifications", icon: "bx-bell" },
  { label: "Organizations", target: "/dashboard/settings/organizations", icon: "bx-building" },
];

/* ---------------------------- PAGE ---------------------------- */

export default function PreferencePage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role as Role | undefined;

  const [currentScope, setCurrentScope] = useState<PreferenceScope | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (role === "ADMIN" || role === "DEV") setCurrentScope("ORGANIZATION");
    else if (role === "MANAGER") setCurrentScope("BRANCH");
    else setCurrentScope("USER");
  }, [role]);

  const groupedByCategory = useMemo(() => {
    return HUB_SETTINGS.reduce((acc, setting) => {
      acc[setting.category] = acc[setting.category]
        ? [...acc[setting.category], setting]
        : [setting];
      return acc;
    }, {} as Record<PreferenceCategory, HubSetting[]>);
  }, []);

  if (status === "loading")
    return <CenteredMessage>Syncing with Cloud…</CenteredMessage>;
  if (!role) return <AccessDenied />;

  const resolveEffectiveValue = (key: string, target?: string) => {
    const t = target ?? null;

    const hierarchy: PreferenceScope[] =
      currentScope === "USER"
        ? ["USER", "BRANCH", "ORGANIZATION"]
        : currentScope === "BRANCH"
        ? ["BRANCH", "ORGANIZATION"]
        : ["ORGANIZATION"];

    for (const s of hierarchy) {
      const p = preferences.find(
        (pref) =>
          pref.key === key && pref.target === t && pref.scope === s
      );
      if (p) return p;
    }
    return null;
  };

  const handleUpdate = (setting: HubSetting, value: any) => {
    if (!currentScope) return;
    setPreferences((prev) => [
      ...prev.filter(
        (p) =>
          !(
            p.key === setting.key &&
            p.scope === currentScope &&
            p.target === (setting.target ?? null)
          )
      ),
      {
        key: setting.key,
        value,
        scope: currentScope,
        category: setting.category,
        target: setting.target ?? null,
      },
    ]);
  };

  return (
    <div className="max-w-[850px] mx-auto py-12 px-6">
      {/* HEADER (unchanged) */}
      <header className="mb-10 flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-black/90">
            Preferences
          </h1>
          <p className="text-[13px] text-black/45">
            Manage global and personal settings for{" "}
            <span className="text-black font-semibold underline decoration-blue-500/30">
              {session?.user?.organizationName || "the Organization"}
            </span>
            .
          </p>
        </div>

        <div className="flex items-center gap-2 bg-black/5 p-1 rounded-lg">
          {["USER", "BRANCH", "ORGANIZATION"].map((s) => (
            <button
              key={s}
              onClick={() => setCurrentScope(s as PreferenceScope)}
              className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                currentScope === s
                  ? "bg-white shadow-sm text-blue-600"
                  : "text-black/40 hover:text-black/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-6">
        {Object.entries(groupedByCategory).map(([category, settings]) => {
          const isOpen = !collapsed[category];

          return (
            <SettingsGroup key={category} header={category}>
              <div className="border-t border-black/5">
                <button
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [category]: !prev[category],
                    }))
                  }
                  className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-semibold text-black/60 hover:bg-black/[0.02]"
                >
                  <span>{category} Settings</span>
                  <span>{isOpen ? "−" : "+"}</span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key={category}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-black/[0.04]">
                        {/* Standard Settings */}
                        {settings.map((setting) => {
                          const effectivePref =
                            resolveEffectiveValue(
                              setting.key,
                              setting.target
                            );
                          const isOverride =
                            effectivePref?.scope === currentScope;

                          return (
                            <SettingRow
                              key={setting.key}
                              setting={setting}
                              value={effectivePref?.value}
                              effectivePref={effectivePref}
                              isOverride={isOverride}
                              onChange={(v) =>
                                handleUpdate(setting, v)
                              }
                              onReset={() =>
                                setPreferences((prev) =>
                                  prev.filter((p) => p !== effectivePref)
                                )
                              }
                            />
                          );
                        })}

                        {/* Summary Visibility inside LAYOUT */}
                        {category === "LAYOUT" && (
                          <>
                            <div className="px-4 pt-6 text-[11px] font-bold text-black/40 uppercase">
                              Summary Visibility
                            </div>

                            {SUMMARY_TARGETS.map((route) => {
                              const effectivePref =
                                resolveEffectiveValue(
                                  "summary_visibility",
                                  route.target
                                );
                              const isOverride =
                                effectivePref?.scope === currentScope;
                              const value =
                                effectivePref?.value ?? true;

                              return (
                                <SettingRow
                                  key={route.target}
                                  setting={{
                                    key: "summary_visibility",
                                    label: route.label,
                                    category: "LAYOUT",
                                    type: "switch",
                                    target: route.target,
                                  }}
                                  icon={route.icon}
                                  value={value}
                                  effectivePref={effectivePref}
                                  isOverride={isOverride}
                                  onChange={(v) =>
                                    handleUpdate(
                                      {
                                        key: "summary_visibility",
                                        category: "LAYOUT",
                                        type: "switch",
                                        label: route.label,
                                        target: route.target,
                                      },
                                      v
                                    )
                                  }
                                  onReset={() =>
                                    setPreferences((prev) =>
                                      prev.filter((p) => p !== effectivePref)
                                    )
                                  }
                                  monoTarget={route.target}
                                />
                              );
                            })}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </SettingsGroup>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------- COMPONENTS ---------------------------- */

function SettingRow({
  setting,
  value,
  effectivePref,
  isOverride,
  onChange,
  onReset,
  icon,
  monoTarget,
}: any) {
  return (
    <div className="flex items-center justify-between py-4 px-4 hover:bg-black/[0.01] transition-colors">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {icon && <i className={`bx ${icon} text-lg text-black/50`} />}
          <span className="text-[13px] font-semibold text-black/80">
            {setting.label}
          </span>

          {effectivePref && (
            <span
              className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                effectivePref.scope === "ORGANIZATION"
                  ? "bg-gray-100 text-gray-500"
                  : effectivePref.scope === "BRANCH"
                  ? "bg-purple-100 text-purple-600"
                  : "bg-blue-100 text-blue-600"
              }`}
            >
              {effectivePref.scope}
            </span>
          )}
        </div>

        {monoTarget && (
          <p className="text-[11px] text-black/35 font-mono">
            {monoTarget}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {renderField(setting, value, onChange)}
        {isOverride && (
          <button
            onClick={onReset}
            className="text-[11px] font-bold text-black/30 hover:text-red-500"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function renderField(setting: HubSetting, value: any, onChange: (v: any) => void) {
  switch (setting.type) {
    case "switch":
      return (
        <button
          onClick={() => onChange(!value)}
          className={`w-10 h-[22px] rounded-full relative p-1 transition ${
            value ? "bg-blue-600" : "bg-black/10"
          }`}
        >
          <motion.div
            animate={{ x: value ? 18 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-4 h-4 bg-white rounded-full shadow-sm"
          />
        </button>
      );
    case "select":
      return (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="bg-black/[0.05] px-2 py-1 rounded-md text-[12px]"
        >
          <option value="" disabled>Select...</option>
          {setting.options?.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="bg-black/[0.05] px-2 py-1 w-20 text-center rounded-md text-[12px]"
        />
      );
    default:
      return null;
  }
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center text-[13px] font-medium text-black/40">
      {children}
    </div>
  );
}