"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Notification, NotificationType } from "@prisma/client";

/* ---------------------------- CONSTANTS ---------------------------- */
const CATEGORIES = [
  { key: "sales", label: "Sales", description: "Orders, invoices, and revenue updates" },
  { key: "system", label: "System", description: "Maintenance and general system alerts" },
  { key: "security", label: "Security", description: "Login alerts and account locks" },
  { key: "approvals", label: "Approvals", description: "Critical actions requiring your attention" },
];

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "inApp", label: "In-App" },
  { key: "sms", label: "SMS" },
];

export default function NotificationsPage() {
  const { data: session, status } = useSession();

  // State
  const [activeTab, setActiveTab] = useState<"feed" | "settings">("feed");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* ---------------------------- FETCH DATA ---------------------------- */
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchData();
      // Initialize settings structure
      setSettings({
        sales: { email: true, inApp: true, sms: false },
        system: { email: true, inApp: true, sms: true },
        security: { email: true, inApp: true, sms: true },
        approvals: { email: true, inApp: true, sms: false },
      });
    }
  }, [session]);

  /* ---------------------------- HANDLERS ---------------------------- */
  const markAsRead = async (id: string) => {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    const res = await fetch("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ ids: unreadIds }),
    });
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  const toggleSetting = (catKey: string, chanKey: string) => {
    setSettings((prev: any) => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        [chanKey]: !prev[catKey][chanKey]
      }
    }));
  };

  const savePreferences = async () => {
    setIsSaving(true);
    // Logic for PATCH /api/preferences goes here
    setTimeout(() => setIsSaving(false), 800); 
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  if (status === "loading") return <CenteredMessage>Loading session...</CenteredMessage>;
  if (!session) return <CenteredMessage>Please sign in to continue.</CenteredMessage>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <i className='bx bx-bell text-blue-600'></i> Notifications
          </h1>
          <p className="text-sm text-gray-500">Stay updated with your organization activity.</p>
        </div>

        <div className="inline-flex p-1 bg-gray-100 rounded-xl">
          <TabButton 
            active={activeTab === "feed"} 
            onClick={() => setActiveTab("feed")}
            label="Activity Feed"
            count={unreadCount}
          />
          <TabButton 
            active={activeTab === "settings"} 
            onClick={() => setActiveTab("settings")}
            label="Preferences"
          />
        </div>
      </div>

      {activeTab === "feed" ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Activity</h2>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-tighter"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {loading ? (
              <div className="p-12 text-center text-gray-400 animate-pulse">
                <i className='bx bx-loader-alt bx-spin text-2xl mb-2'></i>
                <p>Loading updates...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-16 text-center">
                <i className='bx bx-party text-5xl text-gray-200 mb-3'></i>
                <p className="text-gray-400 font-medium">All caught up! No new notifications.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`flex gap-4 p-5 transition ${!n.read ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                  <NotificationTypeIcon type={n.type} />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className={`text-sm ${!n.read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{n.title}</h4>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                        {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 leading-relaxed">{n.message}</p>
                    {!n.read && (
                      <button 
                        onClick={() => markAsRead(n.id)}
                        className="mt-3 text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:text-blue-800 flex items-center gap-1"
                      >
                        <i className='bx bx-check-double text-sm'></i> Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <div className="p-6 border-b border-gray-100 flex items-center gap-3">
             <i className='bx bx-slider-alt text-xl text-blue-600'></i>
             <h3 className="font-bold text-gray-900">Notification Preferences</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {CATEGORIES.map(cat => (
              <div key={cat.key} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="max-w-md">
                  <h4 className="text-sm font-bold text-gray-900">{cat.label}</h4>
                  <p className="text-xs text-gray-500 mt-1">{cat.description}</p>
                </div>
                <div className="flex gap-8">
                  {CHANNELS.map(chan => (
                    <div key={chan.key} className="flex flex-col items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{chan.label}</span>
                      <SmartSwitch 
                        checked={settings?.[cat.key]?.[chan.key]} 
                        onChange={() => toggleSetting(cat.key, chan.key)} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end items-center gap-4">
            <button 
              onClick={savePreferences}
              disabled={isSaving}
              className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- SUB-COMPONENTS ---------------------------- */

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-6 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${
        active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      {count && count > 0 ? (
        <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function NotificationTypeIcon({ type }: { type: NotificationType }) {
  const base = "w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm flex-shrink-0";
  switch (type) {
    case "APPROVAL_REQUIRED": return <div className={`${base} bg-orange-100 text-orange-600`}><i className='bx bx-shield-quarter'></i></div>;
    case "ERROR": return <div className={`${base} bg-red-100 text-red-600`}><i className='bx bx-error-circle'></i></div>;
    case "WARNING": return <div className={`${base} bg-yellow-100 text-yellow-600`}><i className='bx bx-info-circle'></i></div>;
    case "SYSTEM": return <div className={`${base} bg-purple-100 text-purple-600`}><i className='bx bx-bolt-circle'></i></div>;
    default: return <div className={`${base} bg-blue-100 text-blue-600`}><i className='bx bx-envelope'></i></div>;
  }
}

function SmartSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-300 ${checked ? "bg-blue-600" : "bg-gray-200"}`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[50vh] items-center justify-center text-sm font-bold text-gray-400 uppercase tracking-widest">{children}</div>;
}