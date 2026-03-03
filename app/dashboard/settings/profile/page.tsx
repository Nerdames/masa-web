"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";
import ContactForm from "@/components/forms/ContactForm";

/** * TYPES & DTOs */
type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

interface BranchAssignmentDTO {
  branchId: string;
  branchName: string;
  branchLocation: string | null;
  role: Role;
}

interface ActivityLogDTO {
  id: string;
  action: string;
  createdAt: string;
}

interface ProfileDTO {
  id: string;
  name: string | null;
  email: string;
  staffCode: string | null;
  isOrgOwner: boolean;
  disabled: boolean;
  lastLogin: string | null;
  lastActivityAt: string | null;
  organization: { name: string };
  assignments: BranchAssignmentDTO[];
  activityLogs: ActivityLogDTO[];
  updatedAt: string;
}

interface UpdateProfilePayload {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

/** * UTILS */
const formatDate = (date: string | null) =>
  date
    ? new Date(date).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const getRoleStyles = (role: Role): string => {
  const styles: Record<Role, string> = {
    ADMIN: "bg-purple-50 text-purple-700 border-purple-100",
    DEV: "bg-gray-900 text-white border-transparent",
    MANAGER: "bg-blue-50 text-blue-700 border-blue-100",
    SALES: "bg-emerald-50 text-emerald-700 border-emerald-100",
    INVENTORY: "bg-orange-50 text-orange-700 border-orange-100",
    CASHIER: "bg-cyan-50 text-cyan-700 border-cyan-100",
  };
  return styles[role] || "bg-gray-50 text-gray-600";
};

/** * SUB-COMPONENTS */
const InfoRow = ({
  icon,
  label,
  value,
  editable,
  onClick,
  badge,
  canCopy,
}: {
  icon: string;
  label: string;
  value: string;
  editable?: boolean;
  onClick?: () => void;
  badge?: React.ReactNode;
  canCopy?: boolean;
}) => {
  const { addToast } = useToast();

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    addToast({ type: "success", message: `${label} copied` });
  };

  return (
    <div className="group flex items-center justify-between px-6 py-4 border-b border-gray-100 hover:bg-gray-50/50 transition-all text-left">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-8 h-8 flex items-center justify-center rounded bg-gray-50 text-gray-400 group-hover:text-blue-600 transition-colors shrink-0">
          <i className={`bx ${icon} text-lg`} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-black">
              {label}
            </span>
            {badge}
          </div>
          <span className="text-sm text-gray-900 font-semibold truncate">
            {value}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canCopy && (
          <Tooltip content="Copy" side="top">
            <button
              onClick={handleCopy}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
            >
              <i className="bx bx-copy text-lg" />
            </button>
          </Tooltip>
        )}
        {editable && (
          <Tooltip content="Edit" side="top">
            <button
              onClick={onClick}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
            >
              <i className="bx bx-pencil text-lg" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"name" | "email" | "password" | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const { addToast } = useToast();
  const [form, setForm] = useState({ value: "", currentPass: "", newPass: "" });

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
        }
      } catch (err) {
        addToast({ type: "error", message: "Failed to load profile" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [addToast]);

  const isAdmin = profile?.assignments.some(
    (a) => a.role === "ADMIN" || a.role === "DEV"
  );

  const handleEditClick = (
    type: "name" | "email" | "password",
    currentVal: string = ""
  ) => {
    setForm({ value: currentVal, currentPass: "", newPass: "" });
    setEditing(type);
  };

  const handleSave = async () => {
    if (!profile || !editing) return;
    setSaving(true);

    const payload: UpdateProfilePayload = {};
    if (editing === "name") payload.name = form.value;
    else if (editing === "email") {
      payload.email = form.value;
      payload.currentPassword = form.currentPass;
    } else if (editing === "password") {
      payload.currentPassword = form.currentPass;
      payload.newPassword = form.newPass;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      setProfile(data.profile);
      addToast({
        type: "success",
        message: `${editing} updated successfully`,
      });
      setEditing(null);
    } catch (err) {
      addToast({
        type: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FC]">
        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Hydrating Session
        </p>
      </div>
    );

  if (!profile) return null;

  return (
    <main className="min-h-screen overflow-y-hidden bg-[#F8F9FC] py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Hero */}
        <section className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-blue-100 shrink-0">
              {profile.name?.charAt(0) || profile.email.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">{profile.name || "Personnel"}</h1>
              <p className="text-gray-500 font-medium">{profile.organization.name} • {profile.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-start md:justify-end">
            {profile.isOrgOwner && (
              <span className="px-4 py-1.5 bg-amber-50 text-amber-700 text-[10px] font-black rounded-xl border border-amber-100 flex items-center gap-2 tracking-widest whitespace-nowrap">
                <i className="bx bxs-crown text-sm" /> OWNER
              </span>
            )}
            <span className={`px-4 py-1.5 text-[10px] font-black rounded-xl border tracking-widest whitespace-nowrap ${profile.disabled ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              {profile.disabled ? 'ACCOUNT DISABLED' : 'ACCOUNT ACTIVE'}
            </span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 2. Identity Section */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 text-left">
                <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">
                  Identity
                </h3>
              </div>
              <InfoRow
                icon="bx-user"
                label="Full Name"
                value={profile.name ?? "N/A"}
                canCopy
                editable
                onClick={() => handleEditClick("name", profile.name ?? "")}
              />
              <InfoRow
                icon="bx-envelope"
                label="Primary Email"
                value={profile.email}
                canCopy
                editable
                onClick={() => handleEditClick("email", profile.email)}
              />
              <InfoRow
                icon="bx-barcode-reader"
                label="Staff Code"
                value={profile.staffCode ?? "Not Assigned"}
              />
            </section>

            {/* 3. Security Section */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 text-left">
                <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">
                  Security & Sessions
                </h3>
              </div>
              <div className="group flex items-center justify-between px-6 py-5 border-b border-gray-100 hover:bg-gray-50/50 transition-all text-left">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 flex items-center justify-center rounded bg-gray-50 text-gray-400 group-hover:text-red-600 transition-colors">
                    <i className="bx bx-lock-alt text-lg" />
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 font-black">
                      Password
                    </span>
                    <span className="text-sm text-gray-900 font-semibold">
                      ••••••••••••
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleEditClick("password")}
                  className="text-[10px] font-black text-blue-600 hover:underline tracking-widest uppercase underline-offset-4"
                >
                  Change
                </button>
              </div>
              <div className="px-6 py-4 bg-gray-50/20 flex flex-col gap-4">
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-gray-400 font-black  tracking-tighter">
                    Last Login
                  </span>
                  <span className="text-xs text-gray-700 font-bold">
                    {formatDate(profile.lastLogin)}
                  </span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-gray-400 font-black tracking-tighter">
                    Last Activity
                  </span>
                  <span className="text-xs text-gray-700 font-bold">
                    {formatDate(profile.lastActivityAt)}
                  </span>
                </div>
              </div>
            </section>

            {/* 4. Branch Access Section */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-left">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30">
                <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">
                  Branch Privileges
                </h3>
              </div>
              <div className="divide-y divide-gray-50">
                {profile.assignments.map((a) => (
                  <div
                    key={a.branchId}
                    className="flex justify-between items-center px-6 py-4 hover:bg-gray-50/50 group"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-md font-bold text-gray-900">
                        {a.branchName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-gray-400 flex items-center gap-1">
                          <i className="bx bx-map-pin" />{" "}
                          {a.branchLocation || "Address not set"}
                        </span>
                        {a.branchLocation && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(a.branchLocation!);
                              addToast({
                                type: "success",
                                message: "Address copied",
                              });
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-all"
                          >
                            <i className="bx bx-copy text-[10px]" />
                          </button>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-[9px] font-black tracking-widest border shrink-0 ${getRoleStyles(
                        a.role
                      )}`}
                    >
                      p{a.role}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6 flex flex-col">
            {/* 5. Modification Log */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-left flex flex-col h-fit">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">
                  Modification Log
                </h3>
                {profile.activityLogs.length > 5 && (
                  <button
                    onClick={() => setShowAllLogs(true)}
                    className="text-[9px] font-black text-blue-600 tracking-widest hover:underline underline-offset-2"
                  >
                    View All
                  </button>
                )}
              </div>
              <div className="flex flex-col divide-y divide-gray-50">
                {profile.activityLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="px-6 py-4 flex flex-col gap-1">
                    <p className="text-xs  text-gray-900 leading-tight">
                      {log.action}
                    </p>
                    <p className="text-[9px] font-black text-gray-400  tracking-tighter">
                      {formatDate(log.createdAt)}
                    </p>
                  </div>
                ))}
                {profile.activityLogs.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <div className="w-10 h-10 rounded bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <i className="bx bx-history text-gray-300 text-xl" />
                    </div>
                    <span className="text-[10px] font-black text-gray-300 tracking-widest">
                      No Records Found
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Assistance Card */}
            <section className="bg-blue-600 rounded-xl p-8 text-white shadow-xl shadow-blue-100 flex-grow flex flex-col text-left">
              <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center mb-6">
                <i
                  className={`bx ${
                    isAdmin ? "bx-code-alt" : "bx-support"
                  } text-2xl`}
                />
              </div>
              <h3 className="text-xl font-black mb-2 leading-tight">
                {isAdmin || profile.isOrgOwner ? "Dev Support" : "Help Center"}
              </h3>
              <p className="text-sm text-blue-100 leading-relaxed mb-8 flex-grow">
                {isAdmin
                  ? "Contact engineering for system-level requests or API issues."
                  : "Need permission updates? Contact your local administrator."}
              </p>
              <button
                onClick={() => setShowContactForm(true)}
                className="w-full py-4 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-black transition-all uppercase tracking-widest shadow-lg"
              >
                Contact Support
              </button>
            </section>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {/* Support Modal */}
        {showContactForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowContactForm(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md"
            >
              <ContactForm
                user={{
                  id: profile.id,
                  organizationId: profile.organization.name,
                  branchId: profile.assignments[0]?.branchId || null,
                  isAdmin: isAdmin || false,
                }}
                onSuccess={() => {
                  setShowContactForm(false);
                  addToast({ type: "success", message: "Message sent" });
                }}
                onCancel={() => setShowContactForm(false)}
              />
            </motion.div>
          </div>
        )}

        {/* History Modal */}
        {showAllLogs && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowAllLogs(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] text-left"
            >
              <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Modification History</h3>
                <button onClick={() => setShowAllLogs(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                    <i className="bx bx-x text-2xl text-gray-400" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-50 bg-gray-50/20">
                {profile.activityLogs.map((log) => (
                  <div key={log.id} className="px-8 py-5 flex items-start gap-4">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-gray-800">{log.action}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{formatDate(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* Optimized SlideLayer */}
        {editing && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100]"
              onClick={() => !saving && setEditing(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-[320px] bg-white z-[101] shadow-[-20px_0_60px_-15px_rgba(0,0,0,0.1)] flex flex-col text-left font-sans"
            >
              {/* Header */}
              <div className="px-8 pt-14 border-b border-gray-50 shrink-0">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-black text-gray-900 capitalize">
                    Update {editing}
                  </h2>
                  <button
                    onClick={() => setEditing(null)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-gray-900"
                  >
                    <i className="bx bx-x text-2xl" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 font-medium">
                  Please verify your identity to proceed with this system
                  change.
                </p>
              </div>

              {/* Form Content */}
              <div className="flex-1 px-8 py-10 space-y-8 overflow-y-auto bg-white">
                {editing !== "password" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                      New {editing}
                    </label>
                    <input
                      autoFocus
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:bg-white focus:border-blue-500 outline-none transition-all text-gray-900 font-semibold"
                      value={form.value}
                      onChange={(e) =>
                        setForm({ ...form, value: e.target.value })
                      }
                    />
                  </div>
                )}
                {(editing === "password" || editing === "email") && (
                  <div className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                        Current Password
                      </label>
                      <input
                        type="password"
                        placeholder="Verify identity..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:bg-white focus:border-blue-500 outline-none transition-all"
                        value={form.currentPass}
                        onChange={(e) =>
                          setForm({ ...form, currentPass: e.target.value })
                        }
                      />
                    </div>
                    {editing === "password" && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          New Password
                        </label>
                        <input
                          type="password"
                          placeholder="Min. 8 characters"
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:bg-white focus:border-blue-500 outline-none transition-all"
                          value={form.newPass}
                          onChange={(e) =>
                            setForm({ ...form, newPass: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Button */}
              <div className="p-8 border-t border-gray-50 bg-white shrink-0">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black py-4 rounded-lg transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs shadow-lg shadow-blue-100"
                >
                  {saving ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Applying...</span>
                    </>
                  ) : (
                    "Confirm Changes"
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}