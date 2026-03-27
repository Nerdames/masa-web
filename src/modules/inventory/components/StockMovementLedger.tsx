"use client";

import React, { useEffect, useState } from "react";
import { getStockMovementHistory } from "@/src/core/actions/inventory";

export default function StockMovementLedger({ productId }: { productId: string }) {
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => {
    getStockMovementHistory(productId).then(setMovements);
  }, [productId]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {movements.map((move, index) => (
        <div key={move.id} className="relative flex gap-4 group">
          {index !== movements.length - 1 && (
            <div className="absolute left-[19px] top-10 bottom-[-16px] w-[2px] bg-slate-100 group-hover:bg-blue-100 transition-colors" />
          )}

          <div className={`z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-sm ${
            move.type === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}>
            <i className={`bx ${move.type === 'IN' ? 'bx-trending-up' : 'bx-trending-down'} text-xl`} />
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  {move.type}
                </span>
                <h4 className="font-bold text-slate-900 leading-none">
                   {move.quantity} Units <span className="text-slate-400 font-medium">@ ₦{move.unitCost}</span>
                </h4>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-900">Total: ₦{move.totalCost}</span>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Balance: {move.runningBalance}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3 italic">"{move.reason}"</p>

            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-md border border-slate-100 group/hash">
              <i className="bx bx-shield-check text-emerald-500 text-sm" />
              <code className="text-[9px] font-mono text-slate-400 truncate flex-1">
                HASH: {move.hash || "PENDING"}
              </code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
