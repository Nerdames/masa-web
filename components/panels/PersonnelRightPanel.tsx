"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QuickAction from "@/components/dashboard/QuickAction";
import { formatDate } from "@/lib/dateUtils"; // your date formatter
import type { AuthorizedPersonnel, ActivityLog, ApprovalRequest } from "@prisma/client";

interface RightPanelProps {
  profile: AuthorizedPersonnel & {
    activityLogs: ActivityLog[];
    pendingApprovals?: ApprovalRequest[];
  };
  onRefresh: () => void;
  onLockUnlock: (personnelId: string, lock: boolean) => void;
}

export default function PersonnelRightPanel({ profile, onRefresh, onLockUnlock }: RightPanelProps) {
  const [editing, setEditing] = useState<"name" | "email" | "password" | null>(null);
  const [form, setForm] = useState({ value: "", currentPass: "", newPass: "" });
  const [saving, setSaving] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // implement API call to save changes
    setTimeout(() => {
      setSaving(false);
      setEditing(null);
    }, 1200);
  };

  return (
    <div className="space-y-4">

      {/* 1. Quick Actions */}
      <div className="flex flex-col gap-2 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <QuickAction label="Add New Personnel" href="/dashboard/personnels/add" icon={<i className="bx bx-user-plus" />} />
        <QuickAction label="Bulk Import Staff" href="/dashboard/personnels/import" icon={<i className="bx bx-file-import" />} />
        <QuickAction label="Refresh Data" onClick={onRefresh} icon={<i className="bx bx-refresh" />} />
        <QuickAction
          label={profile.isLocked ? "Unlock Account" : "Lock Account"}
          onClick={() => onLockUnlock(profile.id, !profile.isLocked)}
          icon={<i className={`bx ${profile.isLocked ? "bx-lock-open" : "bx-lock"} `} />}
        />
      </div>

      {/* 2. Recent Activity / Notifications */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-left flex flex-col h-fit">
        <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
          <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">
            Recent Activity
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
          {(showAllLogs ? profile.activityLogs : profile.activityLogs.slice(0, 5)).map((log) => (
            <div key={log.id} className="px-6 py-4 flex flex-col gap-1">
              <p className="text-xs text-gray-900 leading-tight">{log.action}</p>
              <p className="text-[9px] font-black text-gray-400 tracking-tighter">{formatDate(log.createdAt)}</p>
            </div>
          ))}
          {profile.activityLogs.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="w-10 h-10 rounded bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <i className="bx bx-history text-gray-300 text-xl" />
              </div>
              <span className="text-[10px] font-black text-gray-300 tracking-widest">No Records Found</span>
            </div>
          )}
        </div>
      </section>

      {/* 3. Last Login / Last Activity */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/20 flex flex-col gap-4">
          <div className="flex flex-col text-left">
            <span className="text-[9px] text-gray-400 font-black tracking-tighter">Last Login</span>
            <span className="text-xs text-gray-700 font-bold">{formatDate(profile.lastLogin)}</span>
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[9px] text-gray-400 font-black tracking-tighter">Last Activity</span>
            <span className="text-xs text-gray-700 font-bold">{formatDate(profile.lastActivityAt)}</span>
          </div>
        </div>
      </section>

      {/* 4. Pending Approvals */}
      {profile.pendingApprovals && profile.pendingApprovals.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/30">
            <h3 className="font-black text-gray-400 text-[10px] tracking-[0.2em] uppercase">Pending Approvals</h3>
          </div>
          <ul className="flex flex-col divide-y divide-gray-50">
            {profile.pendingApprovals.map((req) => (
              <li key={req.id} className="px-6 py-3 text-[10px] text-gray-700 font-bold">
                {req.targetType} request by {req.requester.name} - {req.status}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Slide Layer for Editing */}
      <AnimatePresence>
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
                  <h2 className="text-xl font-black text-gray-900 capitalize">Update {editing}</h2>
                  <button
                    onClick={() => setEditing(null)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-gray-900"
                  >
                    <i className="bx bx-x text-2xl" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 font-medium">Please verify your identity to proceed with this system change.</p>
              </div>

              {/* Form Content */}
              <div className="flex-1 px-8 py-10 space-y-8 overflow-y-auto bg-white">
                {editing !== "password" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">New {editing}</label>
                    <input
                      autoFocus
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:bg-white focus:border-blue-500 outline-none transition-all text-gray-900 font-semibold"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                    />
                  </div>
                )}
                {(editing === "password" || editing === "email") && (
                  <div className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-red-500 uppercase tracking-widest">Current Password</label>
                      <input
                        type="password"
                        placeholder="Verify identity..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:bg-white focus:border-blue-500 outline-none transition-all"
                        value={form.currentPass}
                        onChange={(e) => setForm({ ...form, currentPass: e.target.value })}
                      />
                    </div>
                    {editing === "password" && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">New Password</label>
                        <input
                          type="password"
                          placeholder="Min. 8 characters"
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:bg-white focus:border-blue-500 outline-none transition-all"
                          value={form.newPass}
                          onChange={(e) => setForm({ ...form, newPass: e.target.value })}
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
    </div>
  );
}