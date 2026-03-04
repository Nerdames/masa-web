"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Preference, PreferenceScope, PreferenceCategory } from "@prisma/client";

import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { SettingRow } from "@/components/ui/SettingRow";
import CollapseSection from "@/components/ui/CollapseSection";
import { ResetModal } from "@/components/modal/ResetModal";
import { useToast } from "@/components/feedback/ToastProvider";
import AccessDenied from "@/components/feedback/AccessDenied";

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

interface HubSetting {
  key: string;
  label: string;
  category: PreferenceCategory;
  type: "switch" | "select" | "number";
  options?: { label: string; value: string | number | boolean }[];
  target?: string;
  defaultValue?: string | number | boolean;
}

/* ============================================================
    CONFIG & HELPERS
============================================================ */

const HUB_SETTINGS: HubSetting[] = [
  { key: "auto_lock_invoices", label: "Auto-Lock Invoices", category: "SYSTEM", type: "switch", target: "Invoice", defaultValue: false },
  { key: "stock_approval_threshold", label: "Stock Adjustment Limit", category: "SYSTEM", type: "number", target: "StockMovement", defaultValue: 1000 },
  { key: "default_payment_method", label: "Default Payment", category: "SYSTEM", type: "select", options: [{ label: "Cash", value: "CASH" }, { label: "Card", value: "CARD" }, { label: "Bank Transfer", value: "BANK_TRANSFER" }], target: "Payment", defaultValue: "CASH" },
  { key: "theme_mode", label: "Interface Theme", category: "UI", type: "select", options: [{ label: "System", value: "System" }, { label: "Light", value: "Light" }, { label: "Dark", value: "Dark" }], defaultValue: "System" },
  { key: "row_density", label: "Table Density", category: "TABLE", type: "select", options: [{ label: "Compact", value: "Compact" }, { label: "Standard", value: "Standard" }], defaultValue: "Standard" },
];

const SUMMARY_PAGES = [
  { label: "Dashboard Overview", target: "dashboard-page", icon: "bx-home" },
  { label: "Sales Hub", target: "sales-page", icon: "bx-line-chart" },
  { label: "Orders Hub", target: "orders-page", icon: "bx-cart" },
  { label: "Invoices Hub", target: "invoices-page", icon: "bx-receipt" },
  { label: "Inventory Hub", target: "inventory-page", icon: "bx-box" },
  { label: "Customers Hub", target: "customers-page", icon: "bx-user" },
  { label: "Vendors Hub", target: "vendors-page", icon: "bx-store" },
];

const CATEGORY_ICONS: Record<string, string> = {
  SYSTEM: "bx-cog",
  UI: "bx-paint",
  TABLE: "bx-grid-alt",
  LAYOUT: "bx-layout",
  NOTIFICATION: "bx-bell",
};

/* ============================================================
    PAGE COMPONENT
============================================================ */

export default function PreferencePage() {
  const { data: session, status } = useSession();
  const { addToast } = useToast();
  const role = session?.user?.role as Role | undefined;

  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [expandedAuthority, setExpandedAuthority] = useState<Record<string, boolean>>({});
  const [resetTarget, setResetTarget] = useState<Preference | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [syncing, setSyncing] = useState(true);

  const isAdmin = session?.user?.isOrgOwner || role === "ADMIN" || role === "DEV";
  const isManager = role === "MANAGER";

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/preferences?all=true", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (data.success) setPreferences(data.preferences); })
      .finally(() => setSyncing(false));
  }, [status]);

  /**
   * RESOLVE HIERARCHY WITH LOCKING
   * Priority: Org Lock > Branch Lock > User Value > Branch Value > Org Value > Default
   */
  const resolveHierarchy = (setting: HubSetting) => {
    const find = (s: PreferenceScope) => 
      preferences.find(p => p.key === setting.key && p.scope === s && p.target === (setting.target || null));
    
    const userPref = find("USER");
    const branchPref = find("BRANCH");
    const orgPref = find("ORGANIZATION");

    const isLockedByOrg = !!orgPref?.isLocked;
    const isLockedByBranch = !!branchPref?.isLocked;
    const isLocked = isLockedByOrg || isLockedByBranch;

    let activeScope: PreferenceScope | "DEFAULT" = "DEFAULT";
    if (isLockedByOrg) activeScope = "ORGANIZATION";
    else if (isLockedByBranch) activeScope = "BRANCH";
    else if (userPref) activeScope = "USER";
    else if (branchPref) activeScope = "BRANCH";
    else if (orgPref) activeScope = "ORGANIZATION";

    const activeValue = isLockedByOrg 
      ? orgPref.value 
      : isLockedByBranch 
        ? branchPref.value 
        : (userPref?.value ?? branchPref?.value ?? orgPref?.value ?? setting.defaultValue);

    return { userPref, branchPref, orgPref, activeScope, activeValue, isLocked };
  };

  const handleUpdate = async (
    setting: HubSetting, 
    value: any, 
    scope: PreferenceScope, 
    isLocked: boolean = false
  ) => {
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: setting.key, 
        value, 
        scope, 
        isLocked, // Pass the lock status to the DB
        category: setting.category,
        target: setting.target || null,
        isGlobal: scope === "USER" && !setting.target,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    setPreferences((prev) => [
      ...prev.filter((p) => !(p.key === setting.key && p.scope === scope && p.target === (setting.target || null))),
      data.preference,
    ]);

    addToast({ type: "success", title: "Saved", message: `${scope} policy updated.` });
    window.dispatchEvent(new Event("preference-update"));
  };

  const handleFinalDelete = async () => {
    if (!resetTarget) return;
    setIsResetting(true);
    const params = new URLSearchParams({
      scope: resetTarget.scope, 
      category: resetTarget.category, 
      key: resetTarget.key, 
      target: resetTarget.target ?? "",
    });

    const res = await fetch(`/api/preferences?${params.toString()}`, { method: "DELETE" });
    if (res.ok) {
      setPreferences((prev) => prev.filter((p) => p.id !== resetTarget.id));
      setResetTarget(null);
      addToast({ type: "info", title: "Reset", message: "Reverted to inherited value." });
      window.dispatchEvent(new Event("preference-update"));
    }
    setIsResetting(false);
  };

  const grouped = useMemo(() => {
    const groups = HUB_SETTINGS.reduce((acc, setting) => {
      acc[setting.category] = acc[setting.category] ? [...acc[setting.category], setting] : [setting];
      return acc;
    }, {} as Record<string, HubSetting[]>);
    if (!groups["LAYOUT"]) groups["LAYOUT"] = [];
    return groups;
  }, []);

  if (status === "loading" || syncing) return (
    <div className="h-[60vh] flex items-center justify-center text-[11px] font-black opacity-20 uppercase tracking-widest italic animate-pulse">
      Syncing Hub...
    </div>
  );
  
  if (!role) return <AccessDenied />;

  return (
    <div className="max-w-[850px] mx-auto py-12 px-6 pb-32">
      <header className="mb-12">
        <h1 className="text-2xl font-black text-black/90 tracking-tight italic">Preference Settings</h1>
        <p className="text-[13px] text-black/40">Manage personal workspace overrides and authority-level mandatory policies.</p>
      </header>

      <div className="space-y-6">
        {Object.entries(grouped).map(([category, settings]) => (
          <SettingsGroup 
            key={category} 
            header={category} 
            icon={CATEGORY_ICONS[category] || "bx-cog"}
            count={category === "LAYOUT" ? SUMMARY_PAGES.length : settings.length}
            initialExpanded={category === "SYSTEM"}
          >
            {/* 1. General Settings Rows */}
            {settings.map((setting) => {
              const { userPref, branchPref, orgPref, activeValue, activeScope, isLocked } = resolveHierarchy(setting);
              const hasAuthorityOverride = branchPref ? "BRANCH" : (orgPref ? "ORGANIZATION" : "DEFAULT");

              return (
                <div key={setting.key} className="flex flex-col border-b border-black/[0.02] last:border-0">
                  <SettingRow
                    label={setting.label}
                    value={activeValue}
                    type={setting.type}
                    options={setting.options}
                    isOverride={!!userPref && !isLocked}
                    isLocked={isLocked}
                    activeScope={activeScope}
                    onChange={(val) => handleUpdate(setting, val, "USER")}
                    onReset={() => userPref && setResetTarget(userPref)}
                  />

                  {(isAdmin || isManager) && (
                    <div className="px-4 pb-3">
                      <CollapseSection
                        title="Authority Policy"
                        badgeScope={hasAuthorityOverride}
                        expanded={!!expandedAuthority[setting.key]}
                        onToggle={() => setExpandedAuthority(p => ({ ...p, [setting.key]: !p[setting.key] }))}
                      >
                        <div className="space-y-1 py-1">
                          <SettingRow
                            isMini
                            label="Branch Default"
                            value={branchPref?.value ?? orgPref?.value ?? setting.defaultValue}
                            type={setting.type}
                            options={setting.options}
                            isOverride={!!branchPref}
                            isLocked={!!branchPref?.isLocked}
                            activeScope={branchPref ? "BRANCH" : "DEFAULT"}
                            onChange={(val) => handleUpdate(setting, val, "BRANCH", branchPref?.isLocked)}
                            onReset={() => branchPref && setResetTarget(branchPref)}
                            onToggleLock={() => handleUpdate(setting, branchPref?.value ?? true, "BRANCH", !branchPref?.isLocked)}
                          />
                          {isAdmin && (
                            <SettingRow
                              isMini
                              label="Org Global"
                              value={orgPref?.value ?? setting.defaultValue}
                              type={setting.type}
                              options={setting.options}
                              isOverride={!!orgPref}
                              isLocked={!!orgPref?.isLocked}
                              activeScope={orgPref ? "ORGANIZATION" : "DEFAULT"}
                              onChange={(val) => handleUpdate(setting, val, "ORGANIZATION", orgPref?.isLocked)}
                              onReset={() => orgPref && setResetTarget(orgPref)}
                              onToggleLock={() => handleUpdate(setting, orgPref?.value ?? true, "ORGANIZATION", !orgPref?.isLocked)}
                            />
                          )}
                        </div>
                      </CollapseSection>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 2. Layout Section Specifics */}
            {category === "LAYOUT" && SUMMARY_PAGES.map((page) => {
              const setting: HubSetting = { 
                key: "summary", 
                label: page.label, 
                category: "LAYOUT", 
                type: "switch", 
                target: page.target, 
                defaultValue: true 
              };
              
              const { userPref, branchPref, orgPref, activeValue, activeScope, isLocked } = resolveHierarchy(setting);
              const hasAuthorityOverride = branchPref ? "BRANCH" : (orgPref ? "ORGANIZATION" : "DEFAULT");

              return (
                <div key={page.target} className="flex flex-col border-b border-black/[0.02] last:border-0">
                  <SettingRow
                    label={page.label}
                    value={activeValue}
                    type="switch"
                    isOverride={!!userPref && !isLocked}
                    isLocked={isLocked}
                    activeScope={activeScope}
                    onChange={(val) => handleUpdate(setting, val, "USER")}
                    onReset={() => userPref && setResetTarget(userPref)}
                  />

                  {(isAdmin || isManager) && (
                    <div className="px-4 pb-3">
                      <CollapseSection
                        title={`${page.label} Policy`}
                        badgeScope={hasAuthorityOverride}
                        expanded={!!expandedAuthority[page.target]}
                        onToggle={() => setExpandedAuthority(p => ({ ...p, [page.target]: !p[page.target] }))}
                      >
                        <div className="space-y-1 py-1">
                          <SettingRow
                            isMini
                            label="Branch Visibility"
                            value={branchPref?.value ?? orgPref?.value ?? setting.defaultValue}
                            type="switch"
                            isOverride={!!branchPref}
                            isLocked={!!branchPref?.isLocked}
                            activeScope={branchPref ? "BRANCH" : "DEFAULT"}
                            onChange={(val) => handleUpdate(setting, val, "BRANCH", branchPref?.isLocked)}
                            onReset={() => branchPref && setResetTarget(branchPref)}
                            onToggleLock={() => handleUpdate(setting, branchPref?.value ?? true, "BRANCH", !branchPref?.isLocked)}
                          />
                          {isAdmin && (
                            <SettingRow
                              isMini
                              label="Org Global Visibility"
                              value={orgPref?.value ?? setting.defaultValue}
                              type="switch"
                              isOverride={!!orgPref}
                              isLocked={!!orgPref?.isLocked}
                              activeScope={orgPref ? "ORGANIZATION" : "DEFAULT"}
                              onChange={(val) => handleUpdate(setting, val, "ORGANIZATION", orgPref?.isLocked)}
                              onReset={() => orgPref && setResetTarget(orgPref)}
                              onToggleLock={() => handleUpdate(setting, orgPref?.value ?? true, "ORGANIZATION", !orgPref?.isLocked)}
                            />
                          )}
                        </div>
                      </CollapseSection>
                    </div>
                  )}
                </div>
              );
            })}
          </SettingsGroup>
        ))}
      </div>

      <ResetModal
        open={!!resetTarget}
        pref={resetTarget}
        loading={isResetting}
        onClose={() => setResetTarget(null)}
        onConfirm={handleFinalDelete}
      />
    </div>
  );
}