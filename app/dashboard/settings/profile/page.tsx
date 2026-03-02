"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/feedback/ToastProvider";
import { Tooltip } from "@/components/feedback/Tooltip";

/** * TYPES & DTOs 
 */
type Role = "ADMIN" | "MANAGER" | "SALES" | "INVENTORY" | "CASHIER" | "DEV";

interface BranchAssignmentDTO {
  branchId: string;
  branchName: string;
  branchLocation: string | null;
  role: Role;
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
  updatedAt: string;
}

/** * UTILS 
 */
const formatDate = (date: string | null) => 
  date ? new Date(date).toLocaleString("en-US", { 
    dateStyle: "medium", 
    timeStyle: "short" 
  }) : "—";

const getPasswordStrength = (password: string) => {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: "Weak", color: "bg-red-500", width: "25%" },
    { label: "Fair", color: "bg-orange-500", width: "50%" },
    { label: "Strong", color: "bg-blue-500", width: "75%" },
    { label: "Excellent", color: "bg-green-500", width: "100%" },
  ];
  return levels[Math.max(0, score - 1)];
};

/** * SUB-COMPONENTS 
 */
const InfoRow = ({ 
  icon, label, value, editable, tooltip, onClick, badge 
}: { 
  icon: string; label: string; value: string; editable?: boolean; tooltip?: string; onClick?: () => void; badge?: React.ReactNode 
}) => (
  <div className="group flex items-center justify-between px-8 py-4 border-b border-gray-100 hover:bg-gray-50/50 transition-all">
    <div className="flex items-center gap-4 text-left">
      <Tooltip content={tooltip ?? ""} side="right">
        <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 group-hover:text-blue-600 transition-colors">
          <i className={`bx ${icon} text-lg`} />
        </div>
      </Tooltip>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
           <span className="text-[10px] uppercase tracking-widest text-gray-400 font-black">{label}</span>
           {badge}
        </div>
        <span className="text-sm text-gray-900 font-semibold">{value}</span>
      </div>
    </div>
    {editable && (
      <button 
        onClick={onClick} 
        className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
      >
        <i className="bx bx-pencil text-lg" />
      </button>
    )}
  </div>
);

/** * MAIN PAGE COMPONENT 
 */
export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"name" | "email" | "password" | null>(null);
  const [saving, setSaving] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Unified Form State
  const [form, setForm] = useState({ value: "", currentPass: "", newPass: "" });

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        setProfile(data.profile);
        
        // Check if redirected after successful email verification
        if (searchParams.get("verified") === "true") {
          addToast({ type: "success", message: "Email verified and updated successfully!" });
          // Clean up URL
          router.replace("/profile");
        }
      } catch (err) {
        addToast({ type: "error", message: "Failed to load profile context" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [addToast, searchParams, router]);

  const handleEditClick = (type: "name" | "email" | "password", currentVal: string = "") => {
    setForm({ value: currentVal, currentPass: "", newPass: "" });
    setEditing(type);
  };

  const handleSave = async () => {
    if (!profile || !editing) return;
    setSaving(true);
    
    const isPassword = editing === "password";
    const isEmail = editing === "email";

    // Build Payload: Email/Password changes require currentPassword for security
    const payload: any = { [editing]: form.value };
    if (isPassword) {
      payload.currentPassword = form.currentPass;
      payload.newPassword = form.newPass;
    } else if (isEmail) {
      payload.currentPassword = form.currentPass;
      payload.email = form.value;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Update failed");
      }
      
      // Update local profile with non-sensitive changes (like Name)
      setProfile(data.profile);
      
      if (data.emailChangeStarted) {
        setEmailPending(true);
        addToast({ 
          type: "warning", 
          message: "Verification email sent. Please check your inbox to confirm the change." 
        });
      } else {
        addToast({ type: "success", message: `${editing} updated successfully` });
      }
      
      setEditing(null);
    } catch (err) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="flex space-x-2">
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"></div>
      </div>
      <p className="mt-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Synchronizing Profile</p>
    </div>
  );

  if (!profile) return <div className="p-20 text-center text-gray-500">Authorized Personnel session not found.</div>;

  return (
    <main className="min-h-screen bg-[#F8F9FC] py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6 text-left">
        
        {/* Header Hero */}
        <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
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
                <i className="bx bxs-crown text-sm" /> ORGANIZATION OWNER
              </span>
            )}
            <span className={`px-4 py-1.5 text-[10px] font-black rounded-xl border tracking-widest whitespace-nowrap ${profile.disabled ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              {profile.disabled ? 'ACCOUNT DISABLED' : 'ACCOUNT ACTIVE'}
            </span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info Column */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-8 py-5 border-b border-gray-50 bg-gray-50/30">
                <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase text-left">Identity & Contact</h3>
              </div>
              <InfoRow 
                icon="bx-user" label="Full Name" value={profile.name ?? "Not provided"} 
                editable onClick={() => handleEditClick("name", profile.name ?? "")} 
              />
              <InfoRow 
                icon="bx-envelope" label="Email Address" value={profile.email} 
                editable onClick={() => handleEditClick("email", profile.email)} 
                badge={emailPending && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black animate-pulse">PENDING VERIFICATION</span>
                )}
              />
              <InfoRow icon="bx-barcode-reader" label="Staff Code" value={profile.staffCode ?? "No Code Assigned"} />
            </section>

            {/* Branch Access Section */}
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-8 py-5 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">Branch Privileges</h3>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                  {profile.assignments.length} Assigned
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {profile.assignments.length > 0 ? profile.assignments.map((a) => (
                  <div key={a.branchId} className="flex justify-between px-8 py-5 hover:bg-gray-50/50 transition-colors">
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-gray-900">{a.branchName}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <i className="bx bx-map-pin" /> {a.branchLocation || "Default Location"}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-tighter shadow-sm ${getRoleStyles(a.role)}`}>
                        {a.role}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="px-8 py-10 text-center text-gray-400 text-sm italic">No branch assignments found.</div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
              <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase mb-6 text-left">Security</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                      <i className="bx bx-lock-open-alt text-xl" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Password</span>
                  </div>
                  <button 
                    onClick={() => handleEditClick("password")}
                    className="text-xs font-black text-blue-600 hover:text-blue-700 underline underline-offset-4"
                  >
                    CHANGE
                  </button>
                </div>
                
                <div className="pt-6 border-t border-gray-100 space-y-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 font-medium">Last Login</span>
                    <span className="text-gray-700 font-bold text-right">{formatDate(profile.lastLogin)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 font-medium">Last Activity</span>
                    <span className="text-gray-700 font-bold text-right">{formatDate(profile.lastActivityAt)}</span>
                  </div>
                </div>
              </div>
            </section>

            <div className="p-6 bg-blue-600 rounded-3xl text-white shadow-xl shadow-blue-200 text-left">
              <h4 className="font-bold mb-1">System Support</h4>
              <p className="text-xs text-blue-100 leading-relaxed mb-4">Need help with permissions or branch assignments?</p>
              <button className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-black transition-colors uppercase tracking-widest">
                Contact Admin
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Edit Panel */}
      <AnimatePresence>
        {editing && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-40"
              onClick={() => !saving && setEditing(null)}
            />
            <motion.div 
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white z-50 shadow-[-20px_0_60px_-15px_rgba(0,0,0,0.1)] p-10 flex flex-col text-left"
            >
              <div className="flex justify-between items-center mb-12">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 capitalize">Update {editing}</h2>
                  <p className="text-sm text-gray-400 font-medium">Changes will require authentication.</p>
                </div>
                <button 
                  onClick={() => setEditing(null)} 
                  className="w-12 h-12 flex items-center justify-center hover:bg-gray-100 rounded-2xl transition-all"
                >
                  <i className="bx bx-x text-3xl text-gray-400" />
                </button>
              </div>

              <div className="flex-1 space-y-8 overflow-y-auto pr-2">
                {/* Field Input (Email or Name) */}
                {editing !== "password" && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">New {editing}</label>
                    <input 
                      autoFocus
                      className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-5 focus:bg-white focus:border-blue-500 outline-none transition-all text-gray-900 font-semibold text-lg"
                      value={form.value}
                      placeholder={`Enter new ${editing}...`}
                      onChange={e => setForm({...form, value: e.target.value})}
                    />
                  </div>
                )}

                {/* Sensitive Change Security (Email or Password) */}
                {(editing === "password" || editing === "email") && (
                  <div className="space-y-6 pt-4 border-t border-gray-100">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Verify Identity</label>
                      <input 
                        type="password"
                        placeholder="Current Password"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 focus:bg-white focus:border-blue-500 outline-none transition-all"
                        value={form.currentPass}
                        onChange={e => setForm({...form, currentPass: e.target.value})}
                      />
                      <p className="text-[10px] text-gray-400 font-medium italic">Required to authorize sensitive changes.</p>
                    </div>

                    {editing === "password" && (
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">New Password</label>
                        <input 
                          type="password"
                          className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 focus:bg-white focus:border-blue-500 outline-none transition-all"
                          value={form.newPass}
                          onChange={e => setForm({...form, newPass: e.target.value})}
                        />
                        {form.newPass && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 bg-gray-50 rounded-2xl space-y-3">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                              <span className="text-gray-400">Security Strength</span>
                              <span className={getPasswordStrength(form.newPass).color.replace('bg-', 'text-')}>
                                {getPasswordStrength(form.newPass).label}
                              </span>
                            </div>
                            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                              <motion.div 
                                className={`h-full ${getPasswordStrength(form.newPass).color}`} 
                                initial={{ width: 0 }}
                                animate={{ width: getPasswordStrength(form.newPass).width }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-10">
                <button 
                  onClick={handleSave}
                  disabled={saving || (editing === "password" ? !form.newPass || !form.currentPass : editing === "email" ? !form.value || !form.currentPass : !form.value)}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Synchronizing...
                    </>
                  ) : "Confirm & Save"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}

/** * UI Helpers 
 */
function getRoleStyles(role: Role) {
  const styles: Record<Role, string> = {
    ADMIN: "bg-purple-50 text-purple-700 border-purple-100",
    DEV: "bg-gray-900 text-white border-transparent",
    MANAGER: "bg-blue-50 text-blue-700 border-blue-100",
    SALES: "bg-emerald-50 text-emerald-700 border-emerald-100",
    INVENTORY: "bg-orange-50 text-orange-700 border-orange-100",
    CASHIER: "bg-cyan-50 text-cyan-700 border-cyan-100",
  };
  return styles[role] || "bg-gray-50 text-gray-600";
}