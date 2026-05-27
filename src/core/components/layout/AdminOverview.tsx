"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowUpRight, Users, CheckCircle2, FileText, 
  MapPin, Search, Plus, AlertCircle, RefreshCcw, TrendingUp
} from "lucide-react";
import { usePermission } from "@/core/hooks/usePermission";
import { Role } from "@prisma/client";

// Define local Resource constant map to align with API
const RESOURCES = {
  REPORT: "REPORT",
  INVOICE: "INVOICE",
} as const;

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
}

interface ChartData {
  branch: string;
  revenue: number;
  expenses: number;
  target: number;
}

interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  status: string;
  issuedAt: string;
  branchName: string;
}

interface DashboardData {
  stats: DashboardStats;
  chartData: ChartData[];
  recentInvoices: RecentInvoice[];
}

export default function AdminOverview() {
  const { canSee, canCreate, isAtLeast, isLoading: isAuthLoading } = usePermission();
  
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/overview/admin");
      if (!res.ok) {
        throw new Error(`Terminal Error: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error("Failed to fetch overview data", err);
      setError(err.message || "Failed to establish secure connection to terminal data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Defer calling the async fetch to avoid synchronous setState inside the effect
    // which can trigger cascading renders (react-hooks/exhaustive-deps lint).
    Promise.resolve().then(() => fetchDashboardData());
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // -------------------------------------------------------------
  // LOADING STATE
  // -------------------------------------------------------------
  if (loading || isAuthLoading) {
    return (
      <div className="h-full w-full overflow-y-auto p-4 md:p-6 lg:p-8 bg-slate-50/50">
        <div className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="h-10 w-48 bg-slate-200 rounded-lg"></div>
            <div className="h-10 w-32 bg-slate-200 rounded-lg"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-[280px] bg-slate-200 rounded-2xl"></div>
            <div className="flex flex-col gap-6">
              <div className="h-[128px] bg-slate-200 rounded-2xl"></div>
              <div className="h-[128px] bg-slate-200 rounded-2xl"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[350px] bg-slate-200 rounded-2xl"></div>
            <div className="h-[350px] bg-slate-200 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // ERROR STATE
  // -------------------------------------------------------------
  if (error) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-slate-800 p-6">
        <div className="bg-white border border-red-100 p-8 rounded-3xl shadow-sm max-w-md w-full text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Connection Lost</h1>
          <p className="text-slate-500 mb-8">{error}</p>
          <button 
            onClick={fetchDashboardData}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-medium transition-colors"
          >
            <RefreshCcw className="w-4 h-4" /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // AUTHENTICATION STATE
  // -------------------------------------------------------------
  if (!isAtLeast(Role.MANAGER)) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-slate-800 p-6">
        <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm max-w-md w-full text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-500 mb-8">You do not have the required clearance to view the administration overview.</p>
          <Link 
            href="/" 
            className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-medium transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxChartVal = Math.max(...data.chartData.flatMap(d => [d.revenue, d.expenses, d.target]), 1);

  // -------------------------------------------------------------
  // MAIN RENDER
  // -------------------------------------------------------------
  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50/50 p-4 md:p-6 lg:p-8 font-sans scroll-smooth">
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Overview</h1>
            <p className="text-slate-500 text-sm mt-1">Real-time metrics and branch performance.</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {canCreate(RESOURCES.INVOICE) && (
              <button className="flex-shrink-0 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm shadow-indigo-200">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Action</span>
              </button>
            )}
          </div>
        </header>

        {/* TOP STATS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Revenue Card - Spans 2 cols on large screens */}
          <div className="lg:col-span-2 relative bg-slate-900 rounded-2xl p-8 overflow-hidden flex flex-col justify-between min-h-[240px] shadow-lg shadow-slate-900/10 group">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 p-32 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -right-8 w-64 h-64 border border-white/10 rounded-full pointer-events-none" />
            <div className="absolute -bottom-12 -right-4 w-48 h-48 border border-white/10 rounded-full pointer-events-none" />
            
            <div className="flex justify-between items-start z-10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 text-indigo-300">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <span className="text-slate-300 font-medium text-sm">Total Revenue (30 Days)</span>
              </div>
              
              {canSee(RESOURCES.INVOICE) && (
                <Link href="/admin/finance" className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/5">
                  Financials <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="z-10 mt-8">
              <div className="flex items-baseline gap-3">
                <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                  {formatCurrency(data.stats.totalRevenue)}
                </h2>
                <span className="text-indigo-400 text-sm font-medium bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                  +12.5%
                </span>
              </div>
            </div>
          </div>

          {/* Side Stats Container */}
          <div className="flex flex-col gap-6">
            {/* Customers Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center gap-5 flex-1 hover:border-slate-200 hover:shadow-md transition-all">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Total Customers</p>
                <h3 className="text-2xl font-bold text-slate-900">{data.stats.totalCustomers.toLocaleString()}</h3>
              </div>
            </div>

            {/* Orders Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center gap-5 flex-1 hover:border-slate-200 hover:shadow-md transition-all">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Completed Orders</p>
                <h3 className="text-2xl font-bold text-slate-900">{data.stats.totalOrders.toLocaleString()}</h3>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: CHARTS & TABLES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Branch Performance Chart */}
          <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
            <h3 className="text-lg font-bold text-slate-900 mb-8">Branch Performance</h3>
            
            <div className="flex-1 flex items-end justify-between gap-4 relative mt-auto pt-6">
              {/* Chart Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="border-b border-slate-100 w-full h-0" />
                ))}
              </div>

              {/* Bars */}
              {data.chartData.map((branch, idx) => (
                <div key={idx} className="flex flex-col items-center gap-4 z-10 w-full group">
                  <div className="flex items-end gap-1.5 w-full justify-center h-48">
                    <div 
                      className="w-full max-w-[16px] bg-indigo-500 rounded-t-md transition-all group-hover:bg-indigo-600" 
                      style={{ height: `${(branch.revenue / maxChartVal) * 100}%` }}
                      title={`Revenue: ${formatCurrency(branch.revenue)}`}
                    />
                    <div 
                      className="w-full max-w-[16px] bg-slate-200 rounded-t-md transition-all group-hover:bg-slate-300" 
                      style={{ height: `${(branch.expenses / maxChartVal) * 100}%` }}
                      title={`Expenses: ${formatCurrency(branch.expenses)}`}
                    />
                    <div 
                      className="w-full max-w-[16px] bg-teal-400 rounded-t-md transition-all group-hover:bg-teal-500" 
                      style={{ height: `${(branch.target / maxChartVal) * 100}%` }}
                      title={`Target: ${formatCurrency(branch.target)}`}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate w-full text-center">
                    {branch.branch}
                  </span>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-8 pt-6 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <div className="w-2.5 h-2.5 rounded bg-indigo-500"></div>Revenue
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <div className="w-2.5 h-2.5 rounded bg-slate-200"></div>Expenses
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <div className="w-2.5 h-2.5 rounded bg-teal-400"></div>Target
              </div>
            </div>
          </div>

          {/* Recent Invoices Table */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">Recent Invoices</h3>
              {canSee(RESOURCES.INVOICE) && (
                <Link href="/invoices" className="text-sm text-indigo-600 font-medium hover:text-indigo-700 transition-colors bg-indigo-50 px-3 py-1.5 rounded-lg">
                  View All
                </Link>
              )}
            </div>
            
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left min-w-[400px]">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                    <th className="pb-3 font-semibold pl-2">Invoice details</th>
                    <th className="pb-3 font-semibold">Location</th>
                    <th className="pb-3 font-semibold">Date</th>
                    {canSee(RESOURCES.INVOICE) && <th className="pb-3 font-semibold text-right pr-2">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.recentInvoices.length > 0 ? (
                    data.recentInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="py-3 pl-2">
                          <p className="font-semibold text-sm text-slate-900">{inv.invoiceNumber}</p>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">{formatCurrency(inv.total)}</p>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-medium">{inv.branchName}</span>
                          </div>
                        </td>
                        <td className="py-3 text-sm text-slate-500 font-medium whitespace-nowrap">
                          {new Date(inv.issuedAt).toLocaleDateString('en-GB', { 
                            month: 'short', day: 'numeric', year: 'numeric' 
                          })}
                        </td>
                        
                        {canSee(RESOURCES.INVOICE) && (
                          <td className="py-3 text-right pr-2">
                            <button className="text-slate-400 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-indigo-50 opacity-0 group-hover:opacity-100 focus:opacity-100">
                              <FileText className="w-4 h-4 ml-auto" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 text-sm">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="w-8 h-8 text-slate-200" />
                          <p>No recent invoices found.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}