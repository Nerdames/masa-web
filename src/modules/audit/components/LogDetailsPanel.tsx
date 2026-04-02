"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PermissionAction, Role } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

export const LogDetailsPanel = ({ logData }: { logData: any }) => {
  const { data: session } = useSession();
  const [similarEvents, setSimilarEvents] = useState<any[]>([]);

  const userRole = session?.user?.role as Role;
  const isOrgOwner = session?.user?.isOrgOwner || false;

  // Evaluate Resolution Authority (Only Managers/Admins/Devs/Auditors can clear flags)
  const canResolve = authorize({ role: userRole, isOrgOwner, action: PermissionAction.UPDATE, resource: RESOURCES.AUDIT }).allowed;

  // Auto-discovery heuristic for Similar Cases
  useEffect(() => {
    if (!logData) return;
    const findPatterns = async () => {
        try {
            const res = await fetch(`/api/v1/audit/logs/patterns?action=${logData.action}&actor=${logData.personnelId}`);
            const data = await res.json();
            setSimilarEvents(data.patterns || []);
        } catch(e) {}
    };
    findPatterns();
  }, [logData]);

  if (!logData) return null;

  return (
    <div className="flex flex-col h-full bg-white font-sans selection:bg-black selection:text-white">
      {/* 1. Header */}
      <div className="p-8 border-b border-gray-100 bg-[#FAFAFA]">
        <div className="flex items-center justify-between mb-4">
          <span className="bg-gray-900 text-white px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
            {logData.metadata?.entity || logData.entity || 'SYSTEM'} Module
          </span>
          <span className="text-xs font-mono text-gray-400">HASH_{logData.id.slice(-6).toUpperCase()}</span>
        </div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none italic">
          {logData.action} <span className="text-gray-400">Recorded</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar">
        {logData.action === "VOID" && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-start space-x-3">
            <i className="bx bx-error-alt text-2xl text-red-600" />
            <div>
              <p className="text-xs font-black text-red-600 uppercase">Critical Action Warning</p>
              <p className="text-xs text-red-800 italic mt-0.5">This void has reversed a finalized financial record. Ledger integrity check required.</p>
            </div>
          </div>
        )}

        {/* 2. Execution Context */}
        <section>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Execution Context</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded border border-gray-100">
              <p className="text-[9px] font-black text-gray-400 uppercase">Actor</p>
              <p className="text-sm font-bold text-gray-900">{logData.personnel?.name || logData.personnelName || 'SYSTEM'}</p>
              <p className="text-[10px] text-blue-600 font-bold uppercase">{logData.personnel?.role || logData.personnelRole || 'AUTOMATED'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded border border-gray-100">
              <p className="text-[9px] font-black text-gray-400 uppercase">Temporal State</p>
              <p className="text-sm font-bold text-gray-900">{new Date(logData.createdAt).toLocaleTimeString()}</p>
              <p className="text-[10px] text-gray-500 font-bold">{new Date(logData.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </section>

        {/* 3. Data Diffs */}
        <section>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">State Comparison (Before vs After)</h3>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm opacity-70">
                <div className="px-4 py-2 border-b bg-gray-50 text-[9px] font-black uppercase tracking-widest text-gray-500">Snapshot Before</div>
                <pre className="p-5 text-[11px] font-mono text-gray-700 bg-white overflow-x-auto">{JSON.stringify(logData.metadata?.before || {}, null, 2)}</pre>
            </div>
            <div className="flex justify-center -my-4 relative z-10">
              <div className="bg-black text-white p-1 rounded-full border-4 border-white shadow-lg"><i className="bx bx-down-arrow-alt text-xl" /></div>
            </div>
            <div className="rounded-xl border border-green-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2 border-b bg-green-50 text-[9px] font-black uppercase tracking-widest text-green-700">Snapshot After</div>
                <pre className="p-5 text-[11px] font-mono text-gray-700 bg-white overflow-x-auto">{JSON.stringify(logData.metadata?.after || {}, null, 2)}</pre>
            </div>
          </div>
        </section>

        {/* 4. Pattern Correlation Engine */}
        <section className="bg-gray-50 -mx-8 p-8 border-t border-gray-100">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center">
            <i className="bx bx-layer mr-2 text-base" /> Pattern Correlation (Similar Cases)
          </h3>
          <div className="space-y-2">
            {similarEvents.length > 0 ? similarEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between p-3 bg-white rounded border border-gray-200 hover:border-black transition-all cursor-pointer group">
                <div className="flex items-center space-x-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
                  <div>
                    <p className="text-[11px] font-bold text-gray-900 uppercase tracking-tighter">{ev.metadata?.details || ev.action}</p>
                    <p className="text-[9px] text-gray-400 font-mono">{new Date(ev.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <i className="bx bx-right-arrow-alt text-gray-300 group-hover:text-black group-hover:translate-x-1 transition-all" />
              </div>
            )) : (
              <div className="text-[10px] font-mono text-gray-400 italic">No exact pattern correlations found in the last 72 hours.</div>
            )}
          </div>
        </section>
      </div>

      {/* 5. Resolution Center Footer */}
      <div className="p-6 border-t border-gray-100 bg-white space-y-4 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
        <div className="flex items-center space-x-2">
            <input 
              type="text" 
              placeholder="Add an internal audit note / resolution context..." 
              className="flex-1 bg-gray-50 border border-gray-200 px-4 py-2 text-xs rounded outline-none focus:border-black font-medium transition-colors"
            />
            <button className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-xs hover:bg-blue-700 transition-colors">
              Save
            </button>
        </div>
        <div className="flex items-center justify-between">
          <button className="text-[9px] font-black text-red-600 border border-red-100 px-3 py-2 rounded uppercase hover:bg-red-50 transition-colors">
              Flag for Investigation
          </button>
          
          <div className="flex space-x-2">
              <button className="text-[9px] font-black text-gray-500 uppercase px-3 py-2 hover:bg-gray-50 rounded transition-colors">Archive</button>
              
              {canResolve ? (
                <button className="bg-black text-white px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded shadow-xl hover:-translate-y-0.5 transition-all">
                  Authorize & Clear
                </button>
              ) : (
                <div className="px-4 py-2 bg-gray-100 text-gray-400 text-[9px] font-black uppercase rounded cursor-not-allowed" title="Requires Manager/Admin privileges">
                   Clearance Locked
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};