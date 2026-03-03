"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import AccessDenied from "@/components/feedback/AccessDenied";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { PreferenceScope } from "@prisma/client";
import { useToast } from "@/components/feedback/ToastProvider";

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

type RoutingValue = {
  email: boolean;
  inApp: boolean;
  sms: boolean;
};

/* ---------------------------- PAGE ---------------------------- */

export default function NotificationSettingsPage() {
  const { data: session, status } = useSession();
  const { addToast } = useToast();

  const [currentScope, setCurrentScope] = useState<PreferenceScope>("USER");
  const [prefs, setPrefs] = useState<Record<string, RoutingValue>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  /* ---------------- FETCH ---------------- */

  useEffect(() => {
    if (!session) return;

    async function loadPreferences() {
      setIsLoading(true);
      try {
        const loaded: Record<string, RoutingValue> = {};

        await Promise.all(
          NOTIFICATION_KEYS.map(async (item) => {
            const res = await fetch(
              `/api/notification-preferences?key=${item.key}&scope=${currentScope}`
            );
            const data = await res.json();
            if (data.success) {
              loaded[item.key] = data.data ?? {
                email: false,
                inApp: true,
                sms: false,
              };
            }
          })
        );

        const pauseRes = await fetch(
          `/api/notification-preferences/pause?scope=${currentScope}`
        );
        const pauseData = await pauseRes.json();

        setPrefs(loaded);
        setIsPaused(pauseData?.data?.paused ?? false);
      } catch (err) {
        console.error("Failed to load notification preferences", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadPreferences();
  }, [session, currentScope]);

  /* ---------------- SAVE ---------------- */

  const saveRouting = async (key: string, value: RoutingValue) => {
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: currentScope,
          key,
          value,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Update failed");
      }

      addToast({
        type: "success",
        title: "Updated",
        message: `${key.replace(/_/g, " ")} updated at ${currentScope} level.`,
      });

      return true;
    } catch (err) {
      addToast({
        type: "error",
        title: "Error",
        message: "Could not update notification routing.",
      });
      return false;
    }
  };

  const savePause = async (nextState: boolean) => {
    try {
      const res = await fetch("/api/notification-preferences/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: currentScope,
          paused: nextState,
        }),
      });

      const data = await res.json();

      if (!data.success) throw new Error();

      addToast({
        type: "success",
        title: "System Updated",
        message: nextState
          ? "Notifications paused."
          : "Notifications resumed.",
      });

      return true;
    } catch {
      addToast({
        type: "error",
        title: "Error",
        message: "Could not update system state.",
      });
      return false;
    }
  };

  /* ---------------- HANDLERS ---------------- */

  const handleToggle = async (key: string, channel: ChannelKey) => {
    const currentValue = prefs[key];
    const newValue = {
      ...currentValue,
      [channel]: !currentValue[channel],
    };

    setPrefs((prev) => ({ ...prev, [key]: newValue }));

    const success = await saveRouting(key, newValue);
    if (!success) {
      setPrefs((prev) => ({ ...prev, [key]: currentValue }));
    }
  };

  const handlePauseToggle = async () => {
    const next = !isPaused;
    setIsPaused(next);

    const success = await savePause(next);
    if (!success) setIsPaused(!next);
  };

  /* ---------------- STATES ---------------- */

  if (status === "loading" || isLoading)
    return <CenteredMessage>Syncing Notification Engine…</CenteredMessage>;

  if (!session) return <AccessDenied />;

  /* ---------------- UI ---------------- */

  return (
    <div className="max-w-[850px] mx-auto py-12 px-6">
      <header className="mb-10 flex items-end justify-between border-b border-black/[0.03] pb-8">
        <div>
          <h1 className="text-2xl font-bold text-black/90">
            Notification Controls
          </h1>
          <p className="text-[13px] text-black/45 uppercase tracking-wider font-medium">
            Scope • <span className="text-blue-600">{currentScope}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-black/[0.03] p-1.5 rounded-xl">
          {(["USER", "BRANCH", "ORGANIZATION"] as PreferenceScope[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setCurrentScope(s)}
                className={`px-3 py-1.5 text-[10px] font-black rounded-lg ${
                  currentScope === s
                    ? "bg-white shadow-sm text-blue-600"
                    : "text-black/30 hover:text-black/60"
                }`}
              >
                {s}
              </button>
            )
          )}
        </div>
      </header>

      <div className="space-y-8">
        <SettingsGroup header="System Status">
          <div className="p-5 flex items-center justify-between bg-red-50/20 rounded-xl border border-red-100/30">
            <div>
              <div className="text-[12px] font-bold text-red-600 uppercase">
                Pause All Delivery
              </div>
              <p className="text-[11px] text-black/40">
                Silence alerts across all channels.
              </p>
            </div>
            <Switch
              checked={isPaused}
              onChange={handlePauseToggle}
              color="bg-red-500"
            />
          </div>
        </SettingsGroup>

        <SettingsGroup header="Channel Routing">
          <div className="divide-y divide-black/[0.03]">
            {NOTIFICATION_KEYS.map((item) => (
              <div key={item.key} className="p-5">
                <h3 className="text-[13px] font-bold text-black/80 mb-1">
                  {item.label}
                </h3>
                <p className="text-[11px] text-black/40 mb-4">
                  {item.description}
                </p>

                <div className="flex gap-3">
                  {CHANNELS.map((chan) => (
                    <ChannelChip
                      key={chan.key}
                      label={chan.label}
                      icon={chan.icon}
                      active={!!prefs[item.key]?.[chan.key]}
                      disabled={isPaused}
                      onClick={() =>
                        handleToggle(item.key, chan.key)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SettingsGroup>
      </div>
    </div>
  );
}

/* ---------------- SUB COMPONENTS ---------------- */

function ChannelChip({
  label,
  icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border ${
        active
          ? "bg-blue-50 border-blue-200 text-blue-600"
          : "bg-white border-black/[0.06] text-black/30"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "active:scale-95"}`}
    >
      <i className={`bx ${icon}`} />
      <span className="text-[10px] font-black uppercase">
        {label}
      </span>
    </button>
  );
}

function Switch({
  checked,
  onChange,
  color = "bg-blue-600",
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full relative p-1 transition-colors ${
        checked ? color : "bg-black/10"
      }`}
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
    <div className="flex h-[70vh] items-center justify-center text-[10px] font-black uppercase tracking-[0.3em] text-black/20">
      {children}
    </div>
  );
}