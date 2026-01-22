"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

type Tab = "profile" | "preferences" | "security";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const [profileName, setProfileName] = useState(session?.user?.name ?? "");
  const [email, setEmail] = useState(session?.user?.email ?? "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [password, setPassword] = useState("");

  if (status === "loading") return <p>Loading...</p>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "preferences", label: "Preferences" },
    { id: "security", label: "Security" },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (e.key === "ArrowRight") {
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
    } else if (e.key === "ArrowLeft") {
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prevIndex].id);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Settings Sections"
        className="flex border-b border-gray-300"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 -mb-px border-b-2 font-medium text-sm transition ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <section
            id="panel-profile"
            role="tabpanel"
            aria-labelledby="tab-profile"
            className="bg-white border rounded-md shadow-sm p-6 space-y-4"
          >
            <h2 className="text-xl font-semibold">Profile</h2>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col text-sm font-medium">
                Name
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="mt-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col text-sm font-medium">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
              Save Profile
            </button>
          </section>
        )}

        {/* Preferences Tab */}
        {activeTab === "preferences" && (
          <section
            id="panel-preferences"
            role="tabpanel"
            aria-labelledby="tab-preferences"
            className="bg-white border rounded-md shadow-sm p-6 space-y-4"
          >
            <h2 className="text-xl font-semibold">Preferences</h2>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
              />
              Enable Notifications
            </label>

            <div className="flex items-center gap-3 text-sm font-medium">
              <span>Theme</span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                className="px-2 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </section>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <section
            id="panel-security"
            role="tabpanel"
            aria-labelledby="tab-security"
            className="bg-white border rounded-md shadow-sm p-6 space-y-4"
          >
            <h2 className="text-xl font-semibold text-red-600">Security</h2>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col text-sm font-medium">
                New Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </label>
              <button className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">
                Update Password
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
