"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import clsx from "clsx";

type NotificationSettings = {
  emailNotifications: boolean;
  inAppNotifications: boolean;
};

export default function NotificationsSettingsPage() {
  const { data: session } = useSession();

  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: false,
    inAppNotifications: false,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch current settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/settings/notifications");
        if (!res.ok) throw new Error("Failed to fetch settings");

        const data: NotificationSettings = await res.json();
        setSettings(data);
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error("Failed to save settings");

      setSuccess("Settings saved successfully!");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <div className="text-center py-10 text-gray-500">
        You must be logged in to access this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Notification Settings</h1>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-red-500">{error}</p>}
          {success && <p className="text-green-500">{success}</p>}

          {/* Email Notifications */}
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Email Notifications</h3>
              <p className="text-xs text-gray-500">
                Receive notifications via email.
              </p>
            </div>
            <button
              className={clsx(
                "w-12 h-6 flex items-center rounded-full p-1 transition-colors",
                settings.emailNotifications ? "bg-blue-600" : "bg-gray-300"
              )}
              onClick={() => handleToggle("emailNotifications")}
            >
              <span
                className={clsx(
                  "bg-white w-4 h-4 rounded-full shadow transform transition-transform",
                  settings.emailNotifications ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* In-App Notifications */}
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900">In-App Notifications</h3>
              <p className="text-xs text-gray-500">
                Receive notifications inside the application.
              </p>
            </div>
            <button
              className={clsx(
                "w-12 h-6 flex items-center rounded-full p-1 transition-colors",
                settings.inAppNotifications ? "bg-blue-600" : "bg-gray-300"
              )}
              onClick={() => handleToggle("inAppNotifications")}
            >
              <span
                className={clsx(
                  "bg-white w-4 h-4 rounded-full shadow transform transition-transform",
                  settings.inAppNotifications ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
