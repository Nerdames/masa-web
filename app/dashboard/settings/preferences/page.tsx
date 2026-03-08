"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
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

/* ================= HUB SETTINGS ================= */
const HUB_SETTINGS: HubSetting[] = [
  {
    key: "auto_lock_invoices",
    label: "Auto-Lock Invoices",
    category: "SYSTEM",
    type: "switch",
    target: "Invoice",
    defaultValue: false,
  },
  {
    key: "stock_approval_threshold",
    label: "Stock Adjustment Limit",
    category: "SYSTEM",
    type: "number",
    target: "StockMovement",
    defaultValue: 1000,
  },
  {
    key: "default_payment_method",
    label: "Default Payment",
    category: "SYSTEM",
    type: "select",
    options: [
      { label: "Cash", value: "CASH" },
      { label: "Card", value: "CARD" },
      { label: "Bank Transfer", value: "BANK_TRANSFER" },
    ],
    target: "Payment",
    defaultValue: "CASH",
  },
  {
    key: "theme_mode",
    label: "Interface Theme",
    category: "UI",
    type: "select",
    options: [
      { label: "System", value: "system" },
      { label: "Light", value: "light" },
      { label: "Dark", value: "dark" },
    ],
    defaultValue: "system",
  },
  {
    key: "row_density",
    label: "Row Density",
    category: "TABLE",
    type: "select",
    options: [
      { label: "Compact", value: "compact" },
      { label: "Standard", value: "standard" },
    ],
    defaultValue: "standard",
  },
  {
    key: "table_font_size",
    label: "Table Font Size",
    category: "TABLE",
    type: "select",
    options: [
      { label: "Small", value: "sm" },
      { label: "Normal", value: "md" },
      { label: "Large", value: "lg" },
    ],
    defaultValue: "md",
  },
  {
    key: "table_wrap_cells",
    label: "Wrap Table Cells",
    category: "TABLE",
    type: "switch",
    defaultValue: false,
  },
  {
    key: "table_sticky_header",
    label: "Sticky Table Header",
    category: "TABLE",
    type: "switch",
    defaultValue: true,
  },
  {
    key: "table_row_numbers",
    label: "Show Row Numbers",
    category: "TABLE",
    type: "switch",
    defaultValue: false,
  },
  {
    key: "table_highlight_hover",
    label: "Highlight Row on Hover",
    category: "TABLE",
    type: "switch",
    defaultValue: true,
  },
  {
    key: "table_group_dates",
    label: "Group Rows by Date",
    category: "TABLE",
    type: "switch",
    defaultValue: true,
  },
  {
    key: "table_rows_per_page",
    label: "Rows Per Page",
    category: "TABLE",
    type: "select",
    options: [
      { label: "10", value: 10 },
      { label: "25", value: 25 },
      { label: "50", value: 50 },
      { label: "100", value: 100 },
    ],
    defaultValue: 25,
  },
  {
    key: "table_tooltips",
    label: "Show Column Tooltips",
    category: "TABLE",
    type: "switch",
    defaultValue: true,
  },
];

/* ================= SUMMARY PAGES ================= */
const SUMMARY_PAGES = [
  { label: "Dashboard Overview", target: "dashboard-page", icon: "bx-home" },
  { label: "Sales Hub", target: "sales-page", icon: "bx-line-chart" },
  { label: "Orders Hub", target: "orders-page", icon: "bx-cart" },
  { label: "Invoices Hub", target: "invoices-page", icon: "bx-receipt" },
  { label: "Inventory Hub", target: "inventory-page", icon: "bx-box" },
  { label: "Customers Hub", target: "customers-page", icon: "bx-user" },
  { label: "Vendors Hub", target: "vendors-page", icon: "bx-store" },
  { label: "Personnel Hub", target: "personnels-page", icon: "bx-id-card" },
  { label: "Branch Hub", target: "branches-page", icon: "bx-building" },
  { label: "Organization Hub", target: "organizations-page", icon: "bx-globe" },
];

const CATEGORY_ICONS: Record<string, string> = {
  SYSTEM: "bx-cog",
  UI: "bx-paint",
  TABLE: "bx-grid-alt",
  LAYOUT: "bx-layout",
  NOTIFICATION: "bx-bell",
};

/* ================= PREFERENCE PAGE ================= */
export default function PreferencePage() {
  const { data: session, status } = useSession();
  const { addToast } = useToast();
  const role = session?.user?.role as Role | undefined;

  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [expandedAuthority, setExpandedAuthority] = useState<Record<string, boolean>>({});
  const [resetTarget, setResetTarget] = useState<Preference | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [syncing, setSyncing] = useState(true);

  const toastRef = useRef<Record<string, boolean>>({});

  const showToastOnce = (id: string, toast: Parameters<typeof addToast>[0]) => {
    if (toastRef.current[id]) return;
    addToast(toast);
    toastRef.current[id] = true;
    setTimeout(() => {
      toastRef.current[id] = false;
    }, 2000);
  };

  const isAdmin = session?.user?.isOrgOwner || role === "ADMIN";
  const isManager = role === "MANAGER";

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/preferences?all=true", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPreferences(data.preferences);
      })
      .finally(() => setSyncing(false));
  }, [status]);

  const resolveHierarchy = (setting: HubSetting) => {
    const find = (s: PreferenceScope) =>
      preferences.find(
        (p) => p.key === setting.key && p.scope === s && p.target === (setting.target || null)
      );

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

    const activeValue = isLockedByOrg
      ? orgPref.value
      : isLockedByBranch
      ? branchPref.value
      : userPref?.value ?? branchPref?.value ?? orgPref?.value ?? setting.defaultValue;

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
        isLocked,
        category: setting.category,
        target: setting.target || null,
        isGlobal: scope === "USER" && !setting.target,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    setPreferences((prev) => [
      ...prev.filter(
        (p) =>
          !(
            p.key === setting.key &&
            p.scope === scope &&
            p.target === (setting.target || null)
          )
      ),
      data.preference,
    ]);

    showToastOnce(`${setting.key}-${scope}`, {
      type: "success",
      title: "Saved",
      message: `${scope} policy updated.`,
    });
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

    const res = await fetch(`/api/preferences?${params.toString()}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPreferences((prev) => prev.filter((p) => p.id !== resetTarget.id));
      showToastOnce(`reset-${resetTarget.id}`, {
        type: "info",
        title: "Reset",
        message: "Reverted to inherited value.",
      });
      setResetTarget(null);
    }

    setIsResetting(false);
  };

  const grouped = useMemo(() => {
    const groups = HUB_SETTINGS.reduce((acc, setting) => {
      acc[setting.category] = acc[setting.category]
        ? [...acc[setting.category], setting]
        : [setting];
      return acc;
    }, {} as Record<string, HubSetting[]>);
    if (!groups["LAYOUT"]) groups["LAYOUT"] = [];
    return groups;
  }, []);

  if (status === "loading" || syncing)
    return (
      <div className="h-[60vh] flex items-center justify-center text-[11px] font-black opacity-20 uppercase tracking-widest italic animate-pulse">
        Syncing Hub...
      </div>
    );

  if (!role) return <AccessDenied />;

  return (
    // 'relative z-0' establishes a safe stacking root. 
    // Ensuring 'overflow-visible' allows child selects to pop out of the container.
    <div className="max-w-[850px] mx-auto py-12 px-6 pb-32 relative z-0 overflow-visible">
      <header className="mb-12">
        <h1 className="text-2xl font-black text-black/90 tracking-tight italic">
          Preference Settings
        </h1>
        <p className="text-[13px] text-black/40">
          Manage personal workspace overrides and authority-level mandatory policies.
        </p>
      </header>

      <div className="space-y-6 overflow-visible">
        {Object.entries(grouped).map(([category, settings]) => (
          <SettingsGroup
            key={category}
            header={category}
            icon={CATEGORY_ICONS[category] || "bx-cog"}
            count={category === "LAYOUT" ? SUMMARY_PAGES.length : settings.length}
            initialExpanded={category === "SYSTEM"}
            className="overflow-visible" // Force group to allow overflows
          >
            {settings.map((setting) => {
              const {
                userPref,
                branchPref,
                orgPref,
                activeValue,
                activeScope,
                isLocked,
              } = resolveHierarchy(setting);
              const hasAuthorityOverride = branchPref
                ? "BRANCH"
                : orgPref
                ? "ORGANIZATION"
                : "DEFAULT";

              return (
                <div
                  key={setting.key}
                  className="flex flex-col border-b border-black/[0.02] last:border-0 overflow-visible relative"
                >
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
                    <div className="px-4 pb-3 overflow-visible">
                      <CollapseSection
                        title="Authority Policy"
                        badgeScope={hasAuthorityOverride}
                        expanded={!!expandedAuthority[setting.key]}
                        onToggle={() =>
                          setExpandedAuthority((p) => ({
                            ...p,
                            [setting.key]: !p[setting.key],
                          }))
                        }
                        className="overflow-visible"
                      >
                        <div className="space-y-1 py-1 overflow-visible">
                          <SettingRow
                            isMini
                            label="Branch Default"
                            value={
                              branchPref?.value ??
                              orgPref?.value ??
                              setting.defaultValue
                            }
                            type={setting.type}
                            options={setting.options}
                            isOverride={!!branchPref}
                            isLocked={!!branchPref?.isLocked}
                            activeScope={branchPref ? "BRANCH" : "DEFAULT"}
                            onChange={(val) =>
                              handleUpdate(
                                setting,
                                val,
                                "BRANCH",
                                branchPref?.isLocked
                              )
                            }
                            onReset={() => branchPref && setResetTarget(branchPref)}
                            onToggleLock={() =>
                              handleUpdate(
                                setting,
                                branchPref?.value ?? true,
                                "BRANCH",
                                !branchPref?.isLocked
                              )
                            }
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
                              onChange={(val) =>
                                handleUpdate(
                                  setting,
                                  val,
                                  "ORGANIZATION",
                                  orgPref?.isLocked
                                )
                              }
                              onReset={() => orgPref && setResetTarget(orgPref)}
                              onToggleLock={() =>
                                handleUpdate(
                                  setting,
                                  orgPref?.value ?? true,
                                  "ORGANIZATION",
                                  !orgPref?.isLocked
                                )
                              }
                            />
                          )}
                        </div>
                      </CollapseSection>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Layout / Summary pages */}
            {category === "LAYOUT" &&
              SUMMARY_PAGES.map((page) => {
                const setting: HubSetting = {
                  key: "summary",
                  label: page.label,
                  category: "LAYOUT",
                  type: "switch",
                  target: page.target,
                  defaultValue: true,
                };
                const {
                  userPref,
                  branchPref,
                  orgPref,
                  activeValue,
                  activeScope,
                  isLocked,
                } = resolveHierarchy(setting);
                const hasAuthorityOverride = branchPref
                  ? "BRANCH"
                  : orgPref
                  ? "ORGANIZATION"
                  : "DEFAULT";

                return (
                  <div
                    key={page.target}
                    className="flex flex-col border-b border-black/[0.02] last:border-0 overflow-visible relative"
                  >
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
                      <div className="px-4 pb-3 overflow-visible">
                        <CollapseSection
                          title={`${page.label} Policy`}
                          badgeScope={hasAuthorityOverride}
                          expanded={!!expandedAuthority[page.target]}
                          onToggle={() =>
                            setExpandedAuthority((p) => ({
                              ...p,
                              [page.target]: !p[page.target],
                            }))
                          }
                          className="overflow-visible"
                        >
                          <div className="space-y-1 py-1 overflow-visible">
                            <SettingRow
                              isMini
                              label="Branch Visibility"
                              value={
                                branchPref?.value ??
                                orgPref?.value ??
                                setting.defaultValue
                              }
                              type="switch"
                              isOverride={!!branchPref}
                              isLocked={!!branchPref?.isLocked}
                              activeScope={branchPref ? "BRANCH" : "DEFAULT"}
                              onChange={(val) =>
                                handleUpdate(
                                  setting,
                                  val,
                                  "BRANCH",
                                  branchPref?.isLocked
                                )
                              }
                              onReset={() =>
                                branchPref && setResetTarget(branchPref)
                              }
                              onToggleLock={() =>
                                handleUpdate(
                                  setting,
                                  branchPref?.value ?? true,
                                  "BRANCH",
                                  !branchPref?.isLocked
                                )
                              }
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
                                onChange={(val) =>
                                  handleUpdate(
                                    setting,
                                    val,
                                    "ORGANIZATION",
                                    orgPref?.isLocked
                                  )
                                }
                                onReset={() =>
                                  orgPref && setResetTarget(orgPref)
                                }
                                onToggleLock={() =>
                                  handleUpdate(
                                    setting,
                                    orgPref?.value ?? true,
                                    "ORGANIZATION",
                                    !orgPref?.isLocked
                                  )
                                }
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