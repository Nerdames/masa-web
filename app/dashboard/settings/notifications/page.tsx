"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

/* ---------------------------- TYPES ---------------------------- */

type NotificationChannel = "email" | "inApp" | "sms";
type NotificationCategory = "sales" | "system" | "security";

type ChannelSettings = Record<NotificationChannel, boolean>;
type NotificationSettings = Record<NotificationCategory, ChannelSettings>;

/* ---------------------------- CONSTANTS ---------------------------- */

const CATEGORIES: {
  key: NotificationCategory;
  label: string;
  description: string;
}[] = [
  {
    key: "sales",
    label: "Sales",
    description: "Orders, invoices, and revenue updates",
  },
  {
    key: "system",
    label: "System",
    description: "Downtime, maintenance, and system alerts",
  },
  {
    key: "security",
    label: "Security",
    description: "Login alerts and suspicious activity",
  },
];

const CHANNELS: {
  key: NotificationChannel;
  label: string;
}[] = [
  { key: "email", label: "Email" },
  { key: "inApp", label: "In-App" },
  { key: "sms", label: "SMS" },
];

/* ---------------------------- HELPERS ---------------------------- */

const createEmptySettings = (): NotificationSettings => ({
  sales: { email: false, inApp: false, sms: false },
  system: { email: false, inApp: false, sms: false },
  security: { email: false, inApp: false, sms: false },
});

/* ---------------------------- DUMMY DATA ---------------------------- */

const DUMMY_NOTIFICATION_SETTINGS: NotificationSettings = {
  sales: { email: true, inApp: true, sms: false },
  system: { email: true, inApp: true, sms: true },
  security: { email: true, inApp: true, sms: true },
};

/* ---------------------------- PAGE ---------------------------- */

export default function NotificationsSettingsPage() {
  const { data: session, status } = useSession();

  const [settings, setSettings] =
    useState<NotificationSettings>(createEmptySettings());
  const [initialSettings, setInitialSettings] =
    useState<NotificationSettings>(createEmptySettings());

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);

  /* ---------------------------- INIT (DUMMY FETCH) ---------------------------- */

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettings(DUMMY_NOTIFICATION_SETTINGS);
      setInitialSettings(DUMMY_NOTIFICATION_SETTINGS);
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  /* ---------------------------- HELPERS ---------------------------- */

  const toggleChannel = (
    category: NotificationCategory,
    channel: NotificationChannel
  ): void => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel],
      },
    }));
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(initialSettings);

  const handleSave = (): void => {
    setSaving(true);
    setSuccess(null);

    setTimeout(() => {
      setInitialSettings(settings);
      setSaving(false);
      setSuccess("Notification settings saved");
    }, 600);
  };

  /* ---------------------------- GUARDS ---------------------------- */

  if (status === "loading" || loading) {
    return <CenteredMessage>Loading notification settings…</CenteredMessage>;
  }

  if (!session) {
    return (
      <CenteredMessage>You must be logged in to view this page.</CenteredMessage>
    );
  }

  /* ---------------------------- RENDER ---------------------------- */

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <h1 className="text-lg font-semibold text-gray-900">
          Notification Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose how you want to receive different types of notifications.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        {/* Header */}
        <div className="grid grid-cols-[1fr_repeat(3,100px)] border-b bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
          <span>Category</span>
          {CHANNELS.map(channel => (
            <span key={channel.key} className="text-center">
              {channel.label}
            </span>
          ))}
        </div>

        {/* Rows */}
        {CATEGORIES.map(category => (
          <div
            key={category.key}
            className="grid grid-cols-[1fr_repeat(3,100px)] items-center border-b px-4 py-4 last:border-b-0"
          >
            <div>
              <div className="text-sm font-medium text-gray-900">
                {category.label}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {category.description}
              </p>
            </div>

            {CHANNELS.map(channel => (
              <div key={channel.key} className="flex justify-center">
                <SmartSwitch
                  checked={settings[category.key][channel.key]}
                  onChange={() =>
                    toggleChannel(category.key, channel.key)
                  }
                />
              </div>
            ))}
          </div>
        ))}
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>

        {success && (
          <span className="text-sm text-green-600">{success}</span>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- SMART SWITCH ---------------------------- */

function SmartSwitch(props: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={props.onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full
        transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${props.checked ? "bg-blue-600" : "bg-gray-300"}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow
          transition-transform duration-200 ease-in-out
          ${props.checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

/* ---------------------------- CENTERED MESSAGE ---------------------------- */

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">
      {children}
    </div>
  );
}
