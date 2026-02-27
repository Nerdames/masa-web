"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ToastProvider, useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Tooltip } from "@/components/feedback/Tooltip";

////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////

type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

interface BranchAssignmentDTO {
  branchId: string;
  branchName: string;
  branchLocation: string | null;
  role: Role;
}

interface OrganizationDTO {
  id: string;
  name: string;
  active: boolean;
}

interface BranchDTO {
  id: string;
  name: string;
  location: string | null;
  active: boolean;
}

interface PreferenceDTO {
  id: string;
  scope: "USER" | "BRANCH" | "ORGANIZATION";
  category: "UI" | "LAYOUT" | "TABLE" | "NOTIFICATION" | "SYSTEM";
  key: string;
  target: string | null;
  value: unknown;
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
  organization: OrganizationDTO;
  branch: BranchDTO | null;
  assignments: BranchAssignmentDTO[];
  roles: Role[];
  preferences: PreferenceDTO[];
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  success: boolean;
  profile: ProfileDTO;
}

interface RowProps {
  icon: string;
  label: string;
  value: string;
  editable?: boolean;
  tooltip?: string;
  onClick?: () => void;
}

interface FieldConfig {
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  placeholder?: string;
  onChange: (val: string) => void;
  showStrength?: boolean;
}

interface ProfileModalProps {
  open: boolean;
  title: string;
  fields?: FieldConfig[];
  onClose: () => void;
  actions?: ReactNode;
}

////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString();
}

function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

////////////////////////////////////////////////////////////
// PROFILE MODAL (inbuilt)
////////////////////////////////////////////////////////////

function ProfileModal({ open, title, fields = [], onClose, actions }: ProfileModalProps) {
  const { addToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);

  const initialValuesRef = useRef(fields.map(f => f.value));
  const lastValuesRef = useRef<string[]>([]);
  const fieldsRef = useRef(fields);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const hasChanges = () =>
    fieldsRef.current.some((f, i) => f.value !== initialValuesRef.current[i]);

  const handleClose = () => {
    if (hasChanges()) setShowConfirm(true);
    else onClose();
  };

  const resetFields = () => {
    lastValuesRef.current = fieldsRef.current.map(f => f.value);
    fieldsRef.current.forEach((f, i) => f.onChange(initialValuesRef.current[i]));
    addToast({
      type: "info",
      message: "Fields reset to initial values",
      undo: {
        label: "Undo",
        onClick: () => {
          fieldsRef.current.forEach((f, i) => f.onChange(lastValuesRef.current[i]));
          addToast({ type: "success", message: "Undo successful" });
        },
      },
    });
  };

  const getPasswordStrength = (password: string) => {
    const score = passwordStrength(password);
    switch (score) {
      case 0:
      case 1: return { label: "Weak", color: "bg-red-500", width: "25%" };
      case 2: return { label: "Medium", color: "bg-yellow-500", width: "50%" };
      case 3: return { label: "Strong", color: "bg-blue-500", width: "75%" };
      case 4: return { label: "Very Strong", color: "bg-green-500", width: "100%" };
      default: return { label: "Weak", color: "bg-red-500", width: "25%" };
    }
  };

  const getPasswordCriteria = (password: string) => [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-gray-400 z-50"
              onClick={handleClose}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed top-0 right-0 h-full w-[380px] bg-white shadow-2xl z-50 flex flex-col pt-10"
            >
              <div className="relative flex-1 overflow-y-auto p-10">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">{title}</h2>
                  <button type="button" onClick={resetFields} className="text-gray-500 hover:text-gray-700" title="Reset all fields">
                    <i className="bx bx-reset text-2xl" />
                  </button>
                </div>
                {fields.map((f, i) => {
                  const strength = f.showStrength ? getPasswordStrength(f.value) : null;
                  const criteria = f.showStrength ? getPasswordCriteria(f.value) : [];
                  return (
                    <div key={i} className="mb-4">
                      <input
                        type={f.type || "text"}
                        value={f.value}
                        placeholder={f.placeholder}
                        className="w-full border rounded-lg px-4 py-3"
                        onChange={(e) => f.onChange(e.target.value)}
                      />
                      {f.showStrength && (
                        <div className="mt-2 w-full">
                          <div className="w-full h-3 rounded bg-gray-200 mb-1">
                            <div className={`${strength.color} h-3 rounded`} style={{ width: strength.width }} />
                          </div>
                          <div className="text-sm font-medium mb-1">{strength.label}</div>
                          <ul className="text-xs space-y-1">
                            {criteria.map((c, idx) => (
                              <li key={idx} className={`flex items-center ${c.met ? "text-green-600" : "text-gray-400"}`}>
                                <i className={`bx ${c.met ? "bx-check" : "bx-x"} mr-1`} />
                                {c.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
                {actions}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={showConfirm}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to close?"
        confirmLabel="Discard"
        destructive
        onClose={() => setShowConfirm(false)}
        onConfirm={() => { setShowConfirm(false); onClose(); addToast({ type: "info", message: "Changes discarded" }); }}
      />
    </>
  );
}

////////////////////////////////////////////////////////////
// PROFILE PAGE
////////////////////////////////////////////////////////////

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<"name" | "email" | "password" | null>(null);
  const [value, setValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { addToast } = useToast();

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        const data: ApiResponse = await res.json();
        setProfile(data.profile);
      } catch {
        setProfile(null);
      } finally { setLoading(false); }
    }
    fetchProfile();
  }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true); setError(null);
    const previous = { ...profile };
    if (editing === "name") setProfile({ ...profile, name: value });
    if (editing === "email") setProfile({ ...profile, email: value });
    try {
      const payload: { name?: string; email?: string; currentPassword?: string; newPassword?: string } = {};
      if (editing === "name") payload.name = value;
      if (editing === "email") payload.email = value;
      if (editing === "password") { payload.currentPassword = currentPassword; payload.newPassword = newPassword; }
      const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data: ApiResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setProfile(data.profile); setEditing(null); setCurrentPassword(""); setNewPassword("");
      addToast({ type: "success", message: "Profile updated" });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setProfile(previous); setError(errorMessage);
      addToast({ type: "error", message: errorMessage });
    } finally { setSaving(false); }
  };

  const Row = ({ icon, label, value, editable, tooltip, onClick }: RowProps) => (
    <div className="flex items-center justify-between px-10 py-5 border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
      <div className="flex items-center gap-4">
        <Tooltip content={tooltip ?? ""} side="top" sideOffset={6}>
          <i className={`bx ${icon} text-xl text-gray-400`} />
        </Tooltip>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-900">{value}</span>
        {editable && onClick && (
          <button onClick={onClick} className="text-gray-400 hover:text-gray-900 transition">
            <i className="bx bx-pencil text-lg" />
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-lg">Loading…</div>;
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-lg">Failed to load profile</div>;

  const modalFields: FieldConfig[] = [];
  if (editing === "name") modalFields.push({ label: "Name", value, onChange: setValue });
  if (editing === "email") modalFields.push({ label: "Email", type: "email", value, onChange: setValue });
  if (editing === "password") {
    modalFields.push(
      { label: "Current Password", type: "password", value: currentPassword, onChange: setCurrentPassword },
      { label: "New Password", type: "password", value: newPassword, onChange: setNewPassword, showStrength: true }
    );
  }

  return (
    <ToastProvider>
      <main className="min-h-screen">
        <div className="w-full max-w-5xl mx-auto py-16 bg-white rounded-lg shadow-sm">
          {/* Header */}
          <div className="px-10 mb-10">
            <h1 className="text-4xl font-semibold tracking-tight">Profile</h1>
            <div className="mt-4 flex items-center gap-3">
              {profile.isOrgOwner && (
                <Tooltip content="You are the organization owner" side="top">
                  <span className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                    <i className="bx bx-crown" /> Owner
                  </span>
                </Tooltip>
              )}
              {profile.disabled && (
                <Tooltip content="Your account is disabled" side="top">
                  <span className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-red-100 text-red-600">
                    <i className="bx bx-block" /> Disabled
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white border-y border-gray-200">
            <Row icon="bx-user" label="Name" value={profile.name ?? "—"} editable tooltip="Your display name" onClick={() => { setValue(profile.name ?? ""); setEditing("name"); }} />
            <Row icon="bx-envelope" label="Email" value={profile.email} editable tooltip="Your login email" onClick={() => { setValue(profile.email); setEditing("email"); }} />
            <Row icon="bx-building" label="Organization" value={profile.organization.name} />
            <Row icon="bx-git-branch" label="Primary Branch" value={profile.branch?.name ?? "—"} />
            <Row icon="bx-id-card" label="Staff Code" value={profile.staffCode ?? "—"} />
          </div>

          {/* Access */}
          <div className="mt-10 px-10">
            <h3 className="text-xs uppercase text-gray-500 font-semibold mb-4">Access</h3>
            <div className="bg-white border border-gray-200 divide-y divide-gray-200">
              {profile.assignments.map((a) => (
                <div key={a.branchId} className="flex justify-between px-6 py-4 text-sm">
                  <Tooltip content={a.branchLocation ?? ""} side="top">
                    <span className="text-gray-600 flex items-center gap-2"><i className="bx bx-store" /> {a.branchName}</span>
                  </Tooltip>
                  <span className="font-medium text-gray-900">{a.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security */}
          <div className="mt-10 px-10">
            <h3 className="text-xs uppercase text-gray-500 font-semibold mb-4">Security</h3>
            <div className="bg-white border border-gray-200 divide-y divide-gray-200 text-sm">
              <Row icon="bx-log-in" label="Last Login" value={formatDate(profile.lastLogin)} />
              <Row icon="bx-activity" label="Last Activity" value={formatDate(profile.lastActivityAt)} />
              <Row icon="bx-refresh" label="Last Updated" value={formatDate(profile.updatedAt)} />
              <Row icon="bx-lock" label="Password" value="••••••••" editable tooltip="Change your password" onClick={() => setEditing("password")} />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {editing && (
            <ProfileModal
              open={!!editing}
              title={`Edit ${editing}`}
              fields={modalFields}
              onClose={() => { setEditing(null); setCurrentPassword(""); setNewPassword(""); }}
              actions={
                <button onClick={save} disabled={saving} className="mt-8 w-full bg-black text-white py-3 rounded-lg disabled:opacity-40">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              }
            />
          )}
        </AnimatePresence>
      </main>
    </ToastProvider>
  );
}