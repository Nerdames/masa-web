"use client";

import React, { useState, useMemo } from "react";
import {
  X, Maximize2, Minimize2, AlertOctagon,
  Loader2, CheckCircle2, XCircle, ShieldCheck,
  User, Clock, Database, ArrowRight
} from "lucide-react";
import { useSidePanel } from "@/shared/components/layout/SidePanelContext";
import { useAlerts } from "@/shared/components/feedback/AlertProvider";
import { usePermission } from "@/shared/hooks/usePermission";
import { ApprovalStatus, CriticalAction, Role } from "@prisma/client";

/* -------------------------
    Types - Aligned with Prisma Schema [cite: 513]
------------------------- */
interface ApprovalRequestData {
  id: string;
  organizationId: string;
  branchId?: string | null;
  requesterId: string;
  approverId?: string | null;
  actionType: CriticalAction;
  status: ApprovalStatus;
  requiredRole: Role;
  changes: Record<string, any>;
  rejectionNote?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  expiresAt?: string | Date | null;
  createdAt: string | Date;
  
  // Included Relations [cite: 533, 534]
  requester?: { name: string | null; email: string; staffCode: string | null };
  approver?: { name: string | null; email: string };
  branch?: { name: string };
}

interface ApprovalDetailPanelProps {
  approval: ApprovalRequestData;
  onClose: () => void;
}

export default function ApprovalDetailPanel({ approval, onClose }: ApprovalDetailPanelProps) {
  const { isFullScreen, toggleFullScreen } = useSidePanel();
  const { dispatch } = useAlerts();
  const permissions = usePermission();

  // Local state for optimistic UI updates and interaction flows
  const [currentStatus, setCurrentStatus] = useState<ApprovalStatus>(approval.status);
  const [isProcessing, setIsProcessing] = useState<"APPROVE" | "REJECT" | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");

  // Derived states
  const isPending = currentStatus === ApprovalStatus.PENDING;
  const isApproved = currentStatus === ApprovalStatus.APPROVED;
  const isRejected = currentStatus === ApprovalStatus.REJECTED;
  const isExpired = currentStatus === ApprovalStatus.EXPIRED || 
                    (approval.expiresAt && new Date(approval.expiresAt) < new Date());

  // RBAC Validation: Can the current user authorize this? [cite: 522]
  const canAuthorize = useMemo(() => {
    if (permissions.isLoading || !permissions.isAuthenticated) return false;
    const meetsRoleWeight = permissions.isAtLeast(approval.requiredRole);
    const isSelfRequest = permissions.user?.id === approval.requesterId;
    return meetsRoleWeight && (!isSelfRequest || permissions.user?.isOrgOwner);
  }, [permissions, approval]);

  // JSON formatting for the "changes" payload [cite: 523]
  const formattedChanges = useMemo(() => {
    if (!approval.changes || Object.keys(approval.changes).length === 0) return [];
    return Object.entries(approval.changes).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value)
    }));
  }, [approval.changes]);

  /* -------------------------
      Action Handlers
  ------------------------- */
  async function handleAction(action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !showRejectInput) {
      setShowRejectInput(true);
      return;
    }

    if (action === "REJECT" && !rejectionNote.trim()) {
      dispatch?.({ kind: "TOAST", type: "WARNING", title: "Note Required", message: "Please provide a reason for rejection." });
      return;
    }

    const targetStatus = action === "APPROVE" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    const confirmMessage = action === "APPROVE" 
      ? `Authorize ${approval.actionType.replace(/_/g, " ")}? This action is irreversible and will execute immediately.` 
      : `Reject this request?`;

    if (!window.confirm(confirmMessage)) return;
    
    setIsProcessing(action);

    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: targetStatus,
          rejectionNote: action === "REJECT" ? rejectionNote : null
        }),
      });
      
      const result = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(result.error || `Failed to ${action.toLowerCase()} the request.`);

      setCurrentStatus(targetStatus);
      setShowRejectInput(false);

      dispatch?.({ 
        kind: "PUSH", 
        type: action === "APPROVE" ? "SUCCESS" : "WARNING", 
        title: `Protocol ${action === "APPROVE" ? "Authorized" : "Declined"}`, 
        message: `Request has been marked as ${targetStatus.toLowerCase()}.` 
      });

      window.dispatchEvent(new CustomEvent("approval:resolved", { 
        detail: { id: approval.id, status: targetStatus } 
      }));
      
    } catch (err: any) {
      dispatch?.({ 
        kind: "TOAST", 
        type: "ERROR", 
        title: "Authorization Failed", 
        message: err.message || "An unexpected error occurred during resolution." 
      });
    } finally {
      setIsProcessing(null);
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 shadow-xl overflow-hidden" role="dialog">
      {/* Header - Fixed Distortion with min-w-0 */}
      <div className={`${isFullScreen ? 'px-4 py-3' : 'px-3 py-2'} border-b border-slate-200/60 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 overflow-hidden">
            <h2 className={`${isFullScreen ? 'text-sm' : 'text-xs'} font-bold text-slate-800 dark:text-slate-100 truncate`}>
              Authorization Request
            </h2>
            {isPending && !isExpired && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase animate-pulse">
                Pending
              </span>
            )}
          </div>
          <p className={`${isFullScreen ? 'text-[10px]' : 'text-[9px]'} text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider font-mono truncate`}>
            {approval.id.split('-')[0]} • {approval.actionType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex items-center gap-0.5 ml-2 shrink-0">
          <button onClick={toggleFullScreen} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className={isFullScreen ? "w-4 h-4" : "w-3.5 h-3.5"} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 dark:bg-slate-900/50">
        <div className={`${isFullScreen ? 'p-4 gap-6' : 'p-3 gap-3'} flex flex-col`}>
          
          {/* Information Cards - Stacked in column when !isFullScreen */}
          <div className={`grid gap-3 ${isFullScreen ? 'grid-cols-2' : 'grid-cols-1'}`}>
            
            {/* Requester Profile */}
            <div className="p-3 rounded-xl bg-white dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <User className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Requester</span>
              </div>
              <p className={`${isFullScreen ? 'text-xs' : 'text-[11px]'} font-bold text-slate-800 dark:text-slate-200 truncate`}>
                {approval.requester?.name || "System Actor"}
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[9px] text-slate-500 whitespace-nowrap overflow-hidden">
                  <span className="mr-2">Staff Code</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{approval.requester?.staffCode || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-500 whitespace-nowrap overflow-hidden">
                  <span className="mr-2">Node</span>
                  <span className="text-slate-700 dark:text-slate-300 truncate">{approval.branch?.name || "Global"}</span>
                </div>
              </div>
            </div>

            {/* Context & Metadata */}
            <div className="p-3 rounded-xl bg-white dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-slate-400">
                <Database className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Target Context</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-1 overflow-hidden whitespace-nowrap">
                  <span className="text-[9px] text-slate-500 mr-2">Resource</span>
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase truncate">
                    {approval.targetType || "SYSTEM"}
                  </span>
                </div>
                <div className="flex justify-between items-center overflow-hidden whitespace-nowrap">
                  <span className="text-[9px] text-slate-500 mr-2">Clearance</span>
                  <span className="text-[9px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1 rounded truncate">
                    {approval.requiredRole}
                  </span>
                </div>
                {approval.expiresAt && (
                  <div className="flex justify-between items-center pt-1 overflow-hidden whitespace-nowrap">
                    <span className="text-[9px] text-slate-500 flex items-center gap-1 mr-2"><Clock className="w-2.5 h-2.5" /> TTL</span>
                    <span className={`text-[9px] font-medium truncate ${isExpired ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                      {new Date(approval.expiresAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Changes Delta Viewer */}
          <div className="space-y-2">
            <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center px-1">
              <span>Proposed Changes</span>
              <span className="text-[8px] font-normal lowercase bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 whitespace-nowrap">
                {formattedChanges.length} key(s)
              </span>
            </h4>
            
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-800/20">
              <table className="w-full text-left text-xs table-fixed">
                <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-500 uppercase w-[35%]">Field</th>
                    <th className="px-3 py-2 text-[8px] font-bold text-slate-500 uppercase w-[65%]">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {formattedChanges.length > 0 ? (
                    formattedChanges.map((change) => (
                      <tr key={change.key} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="px-3 py-2 font-mono text-[9px] text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-transparent truncate">
                          {change.key}
                        </td>
                        <td className="px-3 py-2 font-mono text-[9px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap truncate">
                          {change.value}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-3 py-4 text-center text-slate-400 text-[10px] italic">
                        Procedural Override.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resolution Audit Trail */}
          {(isApproved || isRejected) && (
            <div className={`p-3 rounded-lg border ${isApproved ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10'}`}>
              <span className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Resolution Audit</span>
              <p className="text-[10px] text-slate-700 dark:text-slate-300 truncate">
                By <span className="font-bold">{approval.approver?.name || "System"}</span> 
              </p>
              {approval.rejectionNote && (
                <div className="mt-2 text-[9px] text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 p-2 rounded border border-red-100 dark:border-red-900/30 break-words">
                  {approval.rejectionNote}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className={`${isFullScreen ? 'p-4' : 'p-3'} border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-2`}>
        
        {showRejectInput && isPending && !isExpired && (
          <div className="w-full flex gap-2 animate-in slide-in-from-bottom-2">
            <input 
              autoFocus
              type="text" 
              placeholder="Reason..." 
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              className="flex-1 text-[11px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            <button onClick={() => setShowRejectInput(false)} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isRejected ? (
          <div className="w-full py-2 bg-red-50 dark:bg-red-900/10 text-red-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/20">
            <AlertOctagon className="w-3.5 h-3.5" /> Protocol Rejected
          </div>
        ) : isApproved ? (
          <div className="w-full py-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-900/20">
            <ShieldCheck className="w-3.5 h-3.5" /> Protocol Executed
          </div>
        ) : isExpired ? (
          <div className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2">
            <Clock className="w-3.5 h-3.5" /> TTL Expired
          </div>
        ) : (
          <div className="flex w-full gap-2">
            {canAuthorize ? (
              <>
                <button 
                  onClick={() => handleAction("REJECT")} 
                  disabled={isProcessing !== null} 
                  className={`py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all flex justify-center items-center gap-1.5 disabled:opacity-50 ${showRejectInput ? 'flex-[2] bg-red-50 dark:bg-red-900/20' : 'flex-1'}`}
                >
                  {isProcessing === "REJECT" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  {showRejectInput ? "Confirm" : "Decline"}
                </button>
                
                {!showRejectInput && (
                  <button 
                    onClick={() => handleAction("APPROVE")} 
                    disabled={isProcessing !== null} 
                    className="flex-[2] py-2 bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition-all flex justify-center items-center gap-1.5 disabled:opacity-50"
                  >
                    {isProcessing === "APPROVE" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Authorize
                  </button>
                )}
              </>
            ) : (
              <div className="w-full p-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg flex items-start gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300">Insufficient Clearance</p>
                  <p className="text-[9px] text-amber-700 dark:text-amber-400/80 mt-0.5 leading-tight">
                    Requires <span className="font-mono bg-amber-200/50 dark:bg-amber-900/50 px-1 rounded">{approval.requiredRole}</span>. Self-approval is disabled.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}