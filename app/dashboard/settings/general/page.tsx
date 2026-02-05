"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import AccessDenied from "@/components/feedback/AccessDenied";

type PreferenceScope = "USER" | "BRANCH" | "ORGANIZATION";
type PreferenceValue = string | number | boolean | Record<string, unknown>;
type Role = "DEV" | "ADMIN" | "MANAGER" | "USER";

interface Preference {
  id: string;
  key: string;
  value: PreferenceValue;
  target?: string;
  scope: PreferenceScope;
}

interface HubSetting {
  key: string;
  label: string;
  description?: string;
  type: "switch" | "text" | "select" | "number";
  options?: string[];
  target?: string;
  category?: string;
}

// ---------------------------- HUB SETTINGS ----------------------------
const HUB_SETTINGS: HubSetting[] = [
  { key: "currency", label: "Currency", type: "select", options: ["NGN", "USD", "EUR"], description: "Default currency for display" },
  { key: "language", label: "Language", type: "select", options: ["en", "fr", "es"], description: "Preferred UI language" },
  { key: "dark_mode", label: "Dark mode", type: "switch", description: "Use a dark color theme" },
  { key: "summary_cards_visible", label: "Show summary cards", type: "switch", target: "dashboard", category: "UI" },
  { key: "inventory_show_cost", label: "Show cost prices", type: "switch", target: "inventory", category: "TABLE" },
  { key: "table_row_density", label: "Row density", type: "select", options: ["compact", "normal", "spacious"], target: "tables", category: "TABLE" },
  { key: "sales_summary_visible", label: "Show sales summary", type: "switch", target: "sales", category: "UI" },
  { key: "notifications_enabled", label: "Enable notifications", type: "switch", target: "notifications", category: "NOTIFICATION" },
];

// ---------------------------- SCOPE LOGIC ----------------------------
const resolveDefaultScope = (role: Role): PreferenceScope => {
  switch (role) {
    case "DEV":
    case "ADMIN":
      return "ORGANIZATION";
    case "MANAGER":
      return "BRANCH";
    default:
      return "USER";
  }
};

const allowedScopes = (role: Role): PreferenceScope[] => {
  switch (role) {
    case "DEV":
    case "ADMIN":
      return ["USER", "BRANCH", "ORGANIZATION"];
    case "MANAGER":
      return ["USER", "BRANCH"];
    default:
      return ["USER"];
  }
};

// ---------------------------- COMPONENT ----------------------------
export default function PreferencesPage() {
  const { data: session, status } = useSession();
  const params = useSearchParams();
  const router = useRouter();

  const [currentScope, setCurrentScope] = useState<PreferenceScope | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-gray-500">
        Verifying access…
      </div>
    );
  }

  if (!session?.user?.role) {
    return <AccessDenied />;
  }

  const role = session.user.role as Role;

  // Initialize scope from URL query or default
  useEffect(() => {
    const queryScope = params.get("scope") as PreferenceScope;
    if (queryScope && allowedScopes(role).includes(queryScope)) {
      setCurrentScope(queryScope);
    } else {
      const defaultScope = resolveDefaultScope(role);
      setCurrentScope(defaultScope);
      router.replace(`/dashboard/settings/general?scope=${defaultScope}`);
    }
  }, [params, role, router]);

  // Fetch preferences when scope changes
  useEffect(() => {
    if (!session?.user || !currentScope) return;
    fetch(`/api/preferences/effective?scope=${currentScope}`)
      .then(res => res.json())
      .then((data: Preference[]) => setPreferences(data))
      .catch(console.error);
  }, [session?.user, currentScope]);

  const handleScopeChange = (newScope: PreferenceScope) => {
    setCurrentScope(newScope);
    router.replace(`/dashboard/settings/general?scope=${newScope}`);
  };

  const getPref = (key: string, target?: string) =>
    preferences.find(p => p.key === key && p.target === (target ?? null));

  const handleChange = async (setting: HubSetting, value: PreferenceValue) => {
    if (!currentScope) return;
    setSavingKey(setting.key);

    setPreferences(prev =>
      prev.map(p => (p.key === setting.key && p.target === setting.target ? { ...p, value } : p))
    );

    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: setting.key, value, target: setting.target ?? null, scope: currentScope }),
    });

    setSavingKey(null);
  };

  const handleReset = async (setting: HubSetting) => {
    if (!currentScope) return;
    await fetch("/api/preferences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: setting.key, target: setting.target ?? null, scope: currentScope }),
    });

    const refreshed = await fetch(`/api/preferences/effective?scope=${currentScope}`).then(r => r.json());
    setPreferences(refreshed);
  };

  const groupedSettings: Record<string, HubSetting[]> = HUB_SETTINGS.reduce((acc, s) => {
    const section = s.target ?? "general";
    acc[section] ||= [];
    acc[section].push(s);
    return acc;
  }, {} as Record<string, HubSetting[]>);

  if (!currentScope) return null; // Wait for scope initialization

  return (
    <div className="space-y-10">
      {/* Header */}
      <header>
        {/* Scope Selector */}
        {allowedScopes(role).length > 1 && (
          <div className="mt-2">
            <label className="text-sm text-gray-700 mr-2">Select Scope:</label>
            <select
              value={currentScope}
              onChange={e => handleScopeChange(e.target.value as PreferenceScope)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {allowedScopes(role).map(s => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="mt-1 text-sm text-gray-500">
          Role: <strong>{role}</strong> | Editing Scope: <strong>{currentScope}</strong>
        </p>


      </header>

      {/* Preferences Sections */}
      {Object.entries(groupedSettings).map(([section, settings]) => (
        <section key={section} className="border-t pt-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {section === "general" ? "General" : section.replace("_", " ")}
          </h2>

          <div className="divide-y rounded-md border bg-white">
            {settings.map(setting => {
              const pref = getPref(setting.key, setting.target);
              const inherited = pref && pref.scope !== currentScope;
              const canReset = pref?.scope === currentScope;

              return (
                <div key={setting.key} className="flex items-start justify-between gap-6 px-4 py-4">
                  <div className="max-w-md">
                    <div className="text-sm font-medium text-gray-900">{setting.label}</div>
                    {setting.description && <p className="mt-1 text-sm text-gray-500">{setting.description}</p>}
                    {inherited && <p className="mt-1 text-xs text-gray-400">Inherited from {pref.scope.toLowerCase()}</p>}
                  </div>

                  <div className="flex items-center gap-4 min-w-[180px]">
                    {renderControl(setting, pref?.value, inherited || savingKey === setting.key, handleChange)}
                    {canReset && (
                      <button onClick={() => handleReset(setting)} className="text-xs text-gray-500 hover:text-gray-900">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------- CONTROL RENDERER ----------------------------
function renderControl(
  setting: HubSetting,
  value: PreferenceValue | undefined,
  disabled: boolean,
  onChange: (setting: HubSetting, value: PreferenceValue) => void
) {
  switch (setting.type) {
    case "switch":
      return <SmartSwitch checked={!!value} disabled={disabled} onChange={v => onChange(setting, v)} />;
    case "text":
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={e => onChange(setting, e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={(value as number) ?? 0}
          disabled={disabled}
          onChange={e => onChange(setting, Number(e.target.value))}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      );
    case "select":
      return (
        <select
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={e => onChange(setting, e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {setting.options?.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default:
      return null;
  }
}

// ---------------------------- SMART SWITCH ----------------------------
interface SmartSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function SmartSwitch({ checked, disabled, onChange }: SmartSwitchProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "bg-blue-600" : "bg-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
