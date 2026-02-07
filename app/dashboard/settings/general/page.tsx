"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import AccessDenied from "@/components/feedback/AccessDenied";

/* ---------------------------- TYPES ---------------------------- */

type PreferenceScope = "USER" | "BRANCH" | "ORGANIZATION";
type PreferenceValue = string | number | boolean;
type Role = "DEV" | "ADMIN" | "MANAGER" | "USER";

interface Preference {
  key: string;
  value: PreferenceValue;
  target: string | null;
  scope: PreferenceScope;
}

interface HubSetting {
  key: string;
  label: string;
  description?: string;
  type: "switch" | "select" | "text" | "number";
  options?: string[];
  target?: string;
}

/* ---------------------------- SETTINGS ---------------------------- */

const HUB_SETTINGS: HubSetting[] = [
  { key: "currency", label: "Currency", description: "Default currency used across the system", type: "select", options: ["NGN", "USD", "EUR"] },
  { key: "language", label: "Language", description: "Preferred interface language", type: "select", options: ["en", "fr", "es"] },
  { key: "dark_mode", label: "Dark mode", description: "Enable dark color theme", type: "switch" },
  { key: "summary_cards_visible", label: "Show summary cards", description: "Display summary cards on dashboard", type: "switch", target: "dashboard" },
  { key: "inventory_show_cost", label: "Show cost prices", description: "Allow viewing inventory cost prices", type: "switch", target: "inventory" },
  { key: "table_row_density", label: "Row density", description: "Spacing used in tables", type: "select", options: ["compact", "normal", "spacious"], target: "tables" },
];

/* ---------------------------- DUMMY DATA ---------------------------- */

const INITIAL_PREFERENCES: Preference[] = [
  { key: "currency", value: "USD", target: null, scope: "ORGANIZATION" },
  { key: "language", value: "en", target: null, scope: "ORGANIZATION" },
  { key: "dark_mode", value: true, target: null, scope: "BRANCH" },
  { key: "summary_cards_visible", value: true, target: "dashboard", scope: "USER" },
  { key: "table_row_density", value: "compact", target: "tables", scope: "ORGANIZATION" },
];

/* ---------------------------- SCOPE LOGIC ---------------------------- */

const resolveDefaultScope = (role: Role): PreferenceScope => {
  if (role === "DEV" || role === "ADMIN") return "ORGANIZATION";
  if (role === "MANAGER") return "BRANCH";
  return "USER";
};

const allowedScopes = (role: Role): PreferenceScope[] => {
  if (role === "DEV" || role === "ADMIN") return ["USER", "BRANCH", "ORGANIZATION"];
  if (role === "MANAGER") return ["USER", "BRANCH"];
  return ["USER"];
};

/* ---------------------------- PAGE ---------------------------- */

export default function PreferencesPage() {
  const { data: session, status } = useSession();
  const params = useSearchParams();
  const router = useRouter();

  const role = session?.user?.role as Role | undefined;

  const [currentScope, setCurrentScope] = useState<PreferenceScope | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>(INITIAL_PREFERENCES);

  useEffect(() => {
    if (!role) return;

    const queryScope = params.get("scope") as PreferenceScope | null;
    const scope =
      queryScope && allowedScopes(role).includes(queryScope)
        ? queryScope
        : resolveDefaultScope(role);

    setCurrentScope(scope);

    if (!queryScope) router.replace(`?scope=${scope}`);
  }, [params, role, router]);

  if (status === "loading") return <CenteredMessage>Verifying access…</CenteredMessage>;
  if (!role) return <AccessDenied />;
  if (!currentScope) return null;

  /* ---------------------------- HELPERS ---------------------------- */

  const resolveEffectivePreference = (
    key: string,
    target: string | undefined
  ): Preference | undefined => {
    const t = target ?? null;
    return (
      preferences.find(p => p.key === key && p.target === t && p.scope === currentScope) ||
      preferences.find(p => p.key === key && p.target === t && p.scope === "BRANCH") ||
      preferences.find(p => p.key === key && p.target === t && p.scope === "ORGANIZATION")
    );
  };

  const handleChange = (setting: HubSetting, value: PreferenceValue): void => {
    setPreferences(prev => [
      ...prev.filter(
        p =>
          !(
            p.key === setting.key &&
            p.target === (setting.target ?? null) &&
            p.scope === currentScope
          )
      ),
      { key: setting.key, value, target: setting.target ?? null, scope: currentScope },
    ]);
  };

  const handleReset = (setting: HubSetting): void => {
    setPreferences(prev =>
      prev.filter(
        p =>
          !(
            p.key === setting.key &&
            p.target === (setting.target ?? null) &&
            p.scope === currentScope
          )
      )
    );
  };

  const groupedSettings: Record<string, HubSetting[]> = HUB_SETTINGS.reduce(
    (acc, setting) => {
      const section = setting.target ?? "general";
      acc[section] = acc[section] ? [...acc[section], setting] : [setting];
      return acc;
    },
    {} as Record<string, HubSetting[]>
  );

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Role: <strong>{role}</strong> · Editing scope: <strong>{currentScope}</strong>
          </p>
        </div>

        {allowedScopes(role).length > 1 && (
          <ScopeSelector
            role={role}
            currentScope={currentScope}
            onChange={scope => {
              setCurrentScope(scope);
              router.replace(`?scope=${scope}`);
            }}
          />
        )}
      </header>

      {Object.entries(groupedSettings).map(([section, settings]) => (
        <section key={section} className="rounded-lg border bg-white shadow-sm">
          <div className="border-b px-4 py-3 text-xs font-semibold uppercase text-gray-500">
            {section}
          </div>

          <div className="divide-y">
            {settings.map(setting => {
              const pref = resolveEffectivePreference(setting.key, setting.target);
              const overridden = pref?.scope === currentScope;

              return (
                <div
                  key={setting.key}
                  className={`flex items-start justify-between gap-6 px-4 py-4 ${
                    overridden ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="max-w-md">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {setting.label}
                      {pref && <ScopeBadge scope={pref.scope} />}
                    </div>

                    {setting.description && (
                      <p className="mt-1 text-sm text-gray-500">{setting.description}</p>
                    )}

                    {pref && !overridden && (
                      <p className="mt-1 text-xs text-gray-400">
                        Inherited from {pref.scope.toLowerCase()}
                      </p>
                    )}

                    {overridden && (
                      <p className="mt-1 text-xs text-blue-600">
                        Overridden at this scope
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 min-w-[180px]">
                    {pref ? (
                      renderControl(setting, pref.value, v =>
                        handleChange(setting, v)
                      )
                    ) : (
                      <span className="text-xs italic text-gray-400">Not set</span>
                    )}

                    {overridden && (
                      <button
                        onClick={() => handleReset(setting)}
                        className="text-xs text-gray-400 hover:text-gray-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="px-4 py-2 text-xs text-gray-400">
            Reset removes the value at this scope and falls back to the inherited value.
          </p>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------- COMPONENTS ---------------------------- */

function ScopeSelector(props: {
  role: Role;
  currentScope: PreferenceScope;
  onChange: (scope: PreferenceScope) => void;
}) {
  return (
    <select
      value={props.currentScope}
      onChange={e => props.onChange(e.target.value as PreferenceScope)}
      className="rounded-md border px-3 py-2 text-sm"
    >
      {allowedScopes(props.role).map(scope => (
        <option key={scope} value={scope}>
          {scope}
        </option>
      ))}
    </select>
  );
}

function ScopeBadge({ scope }: { scope: PreferenceScope }) {
  const styles: Record<PreferenceScope, string> = {
    USER: "bg-blue-100 text-blue-700",
    BRANCH: "bg-purple-100 text-purple-700",
    ORGANIZATION: "bg-gray-200 text-gray-700",
  };

  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${styles[scope]}`}>
      {scope.toLowerCase()}
    </span>
  );
}

function renderControl(
  setting: HubSetting,
  value: PreferenceValue,
  onChange: (value: PreferenceValue) => void
) {
  if (setting.type === "switch") {
    return <SmartSwitch checked={Boolean(value)} onChange={onChange} />;
  }

  if (setting.type === "select") {
    return (
      <select
        value={String(value)}
        onChange={e => onChange(e.target.value)}
        className="rounded-md border px-2 py-1 text-sm"
      >
        {setting.options?.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return null;
}

/* ---------------------------- FIXED SMART SWITCH ---------------------------- */

function SmartSwitch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { checked, onChange } = props;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full
        transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${checked ? "bg-blue-600" : "bg-gray-300"}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow
          transition-transform duration-200 ease-in-out
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">
      {children}
    </div>
  );
}
