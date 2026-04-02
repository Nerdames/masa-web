"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PermissionAction, Role } from "@prisma/client";
import { authorize, RESOURCES } from "@/core/lib/permission";

export const ChainLinkPanel = ({ traceId }: { traceId: string }) => {
  const { data: session } = useSession();
  const [chain, setChain] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const userRole = session?.user?.role as Role;
  const isOrgOwner = session?.user?.isOrgOwner || false;
  
  // Verify Export Permission
  const canExport = authorize({ role: userRole, isOrgOwner, action: PermissionAction.EXPORT, resource: RESOURCES.AUDIT }).allowed;

  useEffect(() => {
    const fetchChain = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/audit/logs/chain/${traceId}`);
        const data = await res.json();
        setChain(data.chain || []);
      } catch (err) {} finally {
        setLoading(false);
      }
    };
    if (traceId) fetchChain();
  }, [traceId]);

  if (loading) return <div className="p-10 text-center font-mono text-xs opacity-50 animate-pulse">Tracing Transaction Chain...</div>;

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] selection:bg-black selection:text-white">
      {/* 1. Forensic Header */}
      <div className="p-8 border-b border-gray-100 bg-white">
        <div className="flex items-center space-x-3 mb-3">
          <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded tracking-tighter">MASA_CHAIN_TRACE</span>
          <span className="text-xs font-mono text-gray-400 tracking-tighter">{traceId}</span>
        </div>
        <h2 className="text-3xl font-black text-gray-900 tracking-tighter leading-none italic uppercase">
          Automated Process Trace
        </h2>
      </div>

      {/* 2. Chain Isolation Timeline */}
      <div className="flex-1 overflow-y-auto p-8 space-y-px custom-scrollbar bg-gray-50/50">
        {chain.map((event, index) => {
          const isTrigger = index === 0;
          const isCritical = event.critical === true || event.action === 'VOID';

          return (
            <div key={event.id} className={`bg-white border p-6 flex items-start space-x-6 relative ${
                isCritical ? 'border-l-4 border-l-red-600' : 'border-gray-200'
            }`}>
              {index < chain.length - 1 && (
                <div className="absolute left-[54px] top-[75px] w-px h-[calc(100%+12px)] bg-gray-200 border-dashed border-l-2"></div>
              )}
              
              <div className={`flex items-center justify-center w-14 h-14 shrink-0 rounded-full border-4 border-white shadow-lg ${
                isCritical ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {isTrigger ? <i className="bx bx-power-off text-2xl" /> : <i className="bx bx-cog text-2xl animate-spin-slow" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-black tracking-tighter uppercase text-gray-900 italic">
                      Step {index + 1}: {event.action} [{event.metadata?.entity || 'SYSTEM'}]
                    </span>
                    {isTrigger && <span className="text-[10px] text-blue-700 font-bold uppercase tracking-widest">(Chain Trigger)</span>}
                  </div>
                  <div className="text-[10px] font-mono text-gray-400">
                    +{new Date(event.createdAt).getTime() - new Date(chain[0].createdAt).getTime()}ms
                  </div>
                </div>
                
                <p className="text-sm text-gray-700 italic leading-relaxed">"{event.metadata?.details || event.action}"</p>
                
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs font-bold text-gray-500">Actor: <span className="text-gray-900">{event.personnel?.name || event.personnelName || 'SYSTEM'}</span></div>
                    <div className="text-[10px] font-mono text-gray-400 uppercase tracking-tighter">Ref: {event.id.slice(-8).toUpperCase()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Forensic Export */}
      <div className="p-6 border-t border-gray-100 bg-white flex items-center justify-end space-x-3">
          <button className="px-5 py-2.5 bg-gray-100 border border-gray-200 rounded text-[11px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all">
              Copy Trace ID
          </button>
          
          {canExport && (
            <button className="px-5 py-2.5 bg-black text-white rounded text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-gray-800 transition-all">
                Export Forensic Chain
            </button>
          )}
      </div>
    </div>
  );
};