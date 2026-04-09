"use client";

import React, { useEffect, useMemo, useState } from "react";

// -----------------------------
// Types & Constants
// -----------------------------
type Role = "ADMIN" | "MANAGER" | "INVENTORY" | "CASHIER" | "DEV" | "AUDITOR" | "SALES";

interface BranchProduct {
  id: string;
  productId: string;
  stock: number;
  stockVersion: number;
  reorderLevel: number;
  branchId: string;
  organizationId: string;
  sellingPrice: number;
}

interface ActivityLog {
  id: string;
  action: string;
  actorRole: Role;
  targetId: string;
  createdAt: string;
  before: any;
  after: any;
}

const PERMISSIONS: Record<Role, { canManage: boolean; canAudit: boolean }> = {
  ADMIN: { canManage: true, canAudit: true },
  DEV: { canManage: true, canAudit: true },
  MANAGER: { canManage: true, canAudit: true },
  INVENTORY: { canManage: true, canAudit: false },
  AUDITOR: { canManage: false, canAudit: true },
  CASHIER: { canManage: false, canAudit: false },
  SALES: { canManage: false, canAudit: false },
};

export default function InventoryTerminal() {
  // State
  const [inventory, setInventory] = useState<BranchProduct[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Mock Init (Replace with your actual data fetching)
  useEffect(() => {
    const mockData: BranchProduct[] = [
      { id: "1", productId: "MS-TRK-001", stock: 12, reorderLevel: 15, stockVersion: 1, branchId: "Lagos_HQ", organizationId: "masa_01", sellingPrice: 45000 },
      { id: "2", productId: "MS-TRK-002", stock: 150, reorderLevel: 20, stockVersion: 4, branchId: "Lagos_HQ", organizationId: "masa_01", sellingPrice: 12000 },
      { id: "3", productId: "MS-TRK-003", stock: 5, reorderLevel: 10, stockVersion: 2, branchId: "Abuja_BR", organizationId: "masa_01", sellingPrice: 8500 },
    ];
    setInventory(mockData);
    setLoading(false);
  }, []);

  // -----------------------------
  // Derived Stats (Fixed Comparison Logic)
  // -----------------------------
  const stats = useMemo(() => {
    const totalItems = inventory.length;
    // Wrapping comparison in parens or moving here fixes the build error
    const lowStockCount = inventory.filter((i) => i.stock <= i.reorderLevel).length;
    const totalValuation = inventory.reduce((acc, curr) => acc + curr.stock * curr.sellingPrice, 0);

    return { totalItems, lowStockCount, totalValuation };
  }, [inventory]);

  const filteredInventory = inventory.filter((item) =>
    item.productId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-slate-400 animate-pulse">Initializing MASA Terminal...</div>;

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-slate-900 font-sans">
      {/* Header Area */}
      <header className="px-8 py-6 bg-white flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inventory Terminal</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time stock traceability & forensic logging</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
            <input
              type="text"
              placeholder="Search SKU or Serial..."
              className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <i className="bx bx-plus-circle text-lg"></i>
            New Entry
          </button>
        </div>
      </header>

      {/* KPI Section - Sophisticated Minimalism */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 px-8 py-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Stock Items</p>
          <h3 className="text-3xl font-light mt-2">{stats.totalItems}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-50">
          <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Critical Low Stock</p>
          <h3 className="text-3xl font-light mt-2 text-red-600">{stats.lowStockCount}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-50">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Inventory Valuation</p>
          <h3 className="text-3xl font-light mt-2">
            <span className="text-lg mr-1">₦</span>
            {stats.totalValuation.toLocaleString()}
          </h3>
        </div>
      </section>

      <main className="px-8 pb-12 flex flex-col lg:flex-row gap-8">
        {/* Table Area - No broken lines, clean background */}
        <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden border border-slate-50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Product SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Stock</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredInventory.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{item.productId}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">VER: {item.stockVersion}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.branchId}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-sm font-semibold ${item.stock <= item.reorderLevel ? 'text-red-500' : 'text-slate-700'}`}>
                      {item.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      item.stock > item.reorderLevel 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {item.stock > item.reorderLevel ? 'Optimal' : 'Reorder'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-white rounded-md text-slate-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-slate-100">
                        <i className="bx bx-edit-alt text-lg"></i>
                      </button>
                      <button className="p-2 hover:bg-white rounded-md text-slate-400 hover:text-red-600 shadow-sm border border-transparent hover:border-slate-100">
                        <i className="bx bx-trash text-lg"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Forensic Side Feed */}
        <aside className="w-full lg:w-80 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-50">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tighter">Live Audit Feed</h4>
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            </div>
            <div className="space-y-4">
              {logs.length === 0 ? (
                <div className="text-center py-8">
                   <i className="bx bx-shield-quarter text-3xl text-slate-200"></i>
                   <p className="text-xs text-slate-400 mt-2">Waiting for system events...</p>
                </div>
              ) : (
                logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="border-l-2 border-blue-100 pl-4 py-1">
                    <p className="text-[11px] font-bold text-slate-800">{log.action}</p>
                    <p className="text-[10px] text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl shadow-lg text-white">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">Compliance Status</p>
            <h4 className="text-lg font-medium mt-1">Verified Traceability</h4>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              All inventory movements are cryptographically signed and versioned for audit integrity.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}