"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { 
  Search, Plus, Eye, FileText, ShoppingCart, 
  Clock, CheckCircle2, AlertCircle, RefreshCw,
  ShieldCheck, ArrowUpRight, Filter, X, Trash2, Save, Download
} from "lucide-react";

// In production, these import from your actual actions file
// import { getPurchaseOrders, getPurchaseOrderLedger, createPurchaseOrder } from "@/modules/inventory/po-actions";

// -----------------------------
// SCHEMA-ALIGNED TYPES
// -----------------------------
enum Role { ADMIN = "ADMIN", MANAGER = "MANAGER", INVENTORY = "INVENTORY", DEV = "DEV" }
enum POStatus { DRAFT = "DRAFT", ISSUED = "ISSUED", PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", FULFILLED = "FULFILLED", CANCELLED = "CANCELLED" }

interface IPOItem {
  id?: string;
  productId: string;
  productName?: string;
  quantityOrdered: number;
  unitCost: number;
  totalCost?: number;
}

interface IPurchaseOrder {
  id: string;
  poNumber: string;
  status: POStatus;
  totalAmount: number;
  expectedDate: string | null;
  createdAt: string;
  vendor: { id: string; name: string; email: string };
  items: IPOItem[];
  createdBy: { name: string };
}

interface IActivityLog {
  id: string;
  action: string;
  actorRole: Role | null;
  createdAt: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

// -----------------------------
// MAIN WORKSPACE COMPONENT
// -----------------------------
export default function PurchaseOrdersWorkspace({ branchId = "branch-123" }: { branchId?: string }) {
  const [orders, setOrders] = useState<IPurchaseOrder[]>([]);
  const [logs, setLogs] = useState<IActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  // Modal & Panel State
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<IPurchaseOrder | null>(null);

  // MOCK DATA FETCHING (Replace with actual server actions)
  const loadPOData = () => {
    startTransition(async () => {
      try {
        // const [poData, logData] = await Promise.all([getPurchaseOrders(branchId), getPurchaseOrderLedger(branchId)]);
        // setOrders(poData); setLogs(logData);
        
        // --- MOCK DATA FOR UI DEMONSTRATION ---
        setOrders([
          {
            id: "po-1", poNumber: "PO-492011", status: POStatus.ISSUED, totalAmount: 450000, expectedDate: "2026-04-15T00:00:00Z", createdAt: new Date().toISOString(),
            vendor: { id: "v-1", name: "Global Tech Supplies", email: "orders@globaltech.com" }, createdBy: { name: "System Admin" },
            items: [{ productId: "p-1", productName: "Server Rack 42U", quantityOrdered: 2, unitCost: 225000, totalCost: 450000 }]
          }
        ]);
        setLogs([
          { id: "log-1", action: "PO_GENERATED", actorRole: Role.ADMIN, severity: "MEDIUM", description: "Purchase Order PO-492011 issued to Global Tech Supplies", createdAt: new Date().toISOString() }
        ]);
      } catch (error) {
        console.error("PO Integration Error:", error);
      }
    });
  };

  useEffect(() => { if (branchId) loadPOData(); }, [branchId]);

  // -----------------------------
  // ANALYTICS & FILTERS
  // -----------------------------
  const stats = useMemo(() => {
    const totalValue = orders.reduce((acc, curr) => acc + Number(curr.totalAmount), 0);
    const pending = orders.filter(o => o.status === POStatus.ISSUED).length;
    const fulfilled = orders.filter(o => o.status === POStatus.FULFILLED).length;
    const overdue = orders.filter(o => o.status !== POStatus.FULFILLED && o.expectedDate && new Date(o.expectedDate) < new Date()).length;
    return { totalValue, pending, fulfilled, overdue };
  }, [orders]);

  const filteredOrders = orders.filter((order) => {
    const term = searchTerm.toLowerCase();
    return order.poNumber.toLowerCase().includes(term) || order.vendor.name.toLowerCase().includes(term);
  });

  const getStatusConfig = (status: POStatus) => {
    switch (status) {
      case POStatus.FULFILLED: return { label: "FULFILLED", classes: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
      case POStatus.ISSUED: return { label: "ISSUED", classes: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock };
      case POStatus.PARTIALLY_RECEIVED: return { label: "PARTIAL", classes: "bg-amber-50 text-amber-700 border-amber-200", icon: Filter };
      case POStatus.CANCELLED: return { label: "CANCELLED", classes: "bg-red-50 text-red-700 border-red-200", icon: AlertCircle };
      default: return { label: "DRAFT", classes: "bg-slate-50 text-slate-700 border-slate-200", icon: FileText };
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA] text-slate-900 font-sans relative overflow-hidden">
      {/* Global Progress Bar */}
      {isPending && <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500/40 animate-pulse z-50" />}

      {/* Header */}
      <header className="w-full flex flex-col bg-white border-b border-black/[0.04] shrink-0 sticky top-0 z-[30]">
        <div className="w-full flex items-center justify-between px-4 py-2 h-14">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-lg shadow-sm">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-[16px] font-bold tracking-tight text-slate-900">Purchase Orders</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search PO or Vendor..."
                className="bg-slate-100/80 border-none py-1.5 pl-8 pr-4 text-[11px] font-medium w-48 lg:w-64 rounded-md focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <button onClick={loadPOData} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
              <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-emerald-500" : ""}`} />
            </button>
            <button 
              onClick={() => setCreateModalOpen(true)}
              className="flex h-8 px-3 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider rounded-md hover:bg-emerald-700 transition-all items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Initiate PO</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-12">
        {/* Statistics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 lg:px-6 py-4">
          <StatCard title="Asset Pipeline" value={`₦${stats.totalValue.toLocaleString()}`} icon={ShoppingCart} color="emerald" />
          <StatCard title="Active Requests" value={stats.pending} icon={Clock} color="blue" />
          <StatCard title="Overdue Receipts" value={stats.overdue} icon={AlertCircle} color="red" />
          <StatCard title="Cycle Completed" value={stats.fulfilled} icon={CheckCircle2} color="emerald" />
        </section>

        <main className="px-4 lg:px-6 flex flex-col xl:flex-row gap-6">
          {/* Purchase Order Ledger (Table) */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col min-h-[400px]">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Registry</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendor Node</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Commitment (₦)</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Expected Arrival</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Protocol Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">No purchase orders found.</td></tr>
                  ) : filteredOrders.map((order) => {
                    const status = getStatusConfig(order.status);
                    const StatusIcon = status.icon;

                    return (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-bold text-slate-900">{order.poNumber}</div>
                          <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">By {order.createdBy.name}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-[12px] font-semibold text-slate-700">{order.vendor.name}</div>
                          <div className="text-[10px] text-slate-400 truncate w-32">{order.vendor.email}</div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="text-[13px] font-bold text-slate-900">{Number(order.totalAmount).toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{order.items.length} SKUs Ordered</div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-[11px] font-medium text-slate-600">
                              {order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold tracking-widest border ${status.classes}`}>
                              <StatusIcon className="w-3 h-3" />
                              {status.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setSelectedPO(order)} className="p-1.5 bg-white hover:bg-slate-100 rounded text-slate-400 hover:text-emerald-600 border border-slate-200 transition-colors" title="View Details">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 bg-white hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 border border-slate-200 transition-colors" title="Download PDF">
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Forensic Audit Aside */}
          <aside className="w-full xl:w-[320px] flex-shrink-0">
            <div className="bg-white p-5 rounded-xl border border-slate-200/60 lg:h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar shadow-sm">
              <div className="flex items-center justify-between mb-5 sticky top-0 bg-white pb-3 border-b border-slate-100 z-10">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Audit Ledger</h4>
                </div>
                <div className="flex relative h-2 w-2">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
              </div>
              
              <div className="space-y-4">
                {logs.length === 0 ? (
                   <p className="text-[11px] text-slate-400 text-center py-4">No recent audit events.</p>
                ) : logs.map((log) => (
                  <div key={log.id} className="relative pl-3">
                    <div className="absolute left-0 top-1.5 bottom-[-16px] w-px bg-slate-100 last:hidden"></div>
                    <div className={`absolute left-[-3px] top-1.5 w-1.5 h-1.5 rounded-full ring-2 ring-white ${
                      log.severity === 'CRITICAL' ? 'bg-red-500' :
                      log.severity === 'HIGH' ? 'bg-orange-500' :
                      log.severity === 'MEDIUM' ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}></div>
                    <div className="bg-slate-50/50 rounded-md p-2.5 border border-slate-100/80 hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest leading-none">
                          {log.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-[8px] text-slate-400 font-mono">
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 mt-1 leading-snug">{log.description}</p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[8px] font-black text-emerald-600 bg-emerald-100/50 px-1.5 py-0.5 rounded tracking-tighter">
                          {log.actorRole || 'SYSTEM'}
                        </span>
                        <ArrowUpRight className="w-2.5 h-2.5 text-slate-300" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>
      </div>

      {/* Inline Modals & Panels */}
      {isCreateModalOpen && <CreatePOModal onClose={() => setCreateModalOpen(false)} onRefresh={loadPOData} />}
      {selectedPO && <PODetailPanel po={selectedPO} onClose={() => setSelectedPO(null)} />}
    </div>
  );
}

// -----------------------------
// INLINE COMPONENTS
// -----------------------------

function StatCard({ title, value, icon: Icon, color }: any) {
  const colorMap: any = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    red: "text-red-600",
  };
  const iconColorMap: any = {
    emerald: "text-emerald-200",
    blue: "text-blue-200",
    red: "text-red-200",
  };

  return (
    <div className="bg-white p-4 lg:p-5 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
      <p className={`text-[10px] font-bold ${colorMap[color] || 'text-slate-500'} uppercase tracking-wider`}>{title}</p>
      <div className="flex items-end justify-between mt-2">
        <h3 className={`text-xl lg:text-2xl font-bold ${color === 'emerald' ? 'text-slate-900' : colorMap[color]}`}>{value}</h3>
        <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
      </div>
    </div>
  );
}

// CREATE PO MODAL
function CreatePOModal({ onClose, onRefresh }: { onClose: () => void, onRefresh: () => void }) {
  const [items, setItems] = useState<IPOItem[]>([{ productId: "", quantityOrdered: 1, unitCost: 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItem = () => setItems([...items, { productId: "", quantityOrdered: 1, unitCost: 0 }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  
  const updateItem = (index: number, field: keyof IPOItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API Call
    setTimeout(() => {
      setIsSubmitting(false);
      onRefresh();
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Initiate Purchase Order</h2>
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">Secure protocol & audit logging enabled</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Vendor Node</label>
                <select required className="w-full border border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                  <option value="">Select Vendor...</option>
                  <option value="v-1">Global Tech Supplies</option>
                  <option value="v-2">Apex Distributors</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Expected Arrival</label>
                <input type="date" required className="w-full border border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white" />
              </div>
            </div>

            {/* Line Items */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Line Items</span>
                <button type="button" onClick={addItem} className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 hover:text-emerald-700">
                  <Plus className="w-3 h-3" /> Add SKU
                </button>
              </div>
              <div className="p-4 space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-[10px] text-slate-500 uppercase mb-1">Product</label>
                      <input type="text" placeholder="SKU or Product Name" required className="w-full border border-slate-200 rounded-md text-sm p-2 outline-none focus:border-emerald-500" />
                    </div>
                    <div className="w-full sm:w-24">
                      <label className="block text-[10px] text-slate-500 uppercase mb-1">Qty</label>
                      <input type="number" min="1" value={item.quantityOrdered} onChange={(e) => updateItem(idx, "quantityOrdered", Number(e.target.value))} required className="w-full border border-slate-200 rounded-md text-sm p-2 outline-none focus:border-emerald-500" />
                    </div>
                    <div className="w-full sm:w-32">
                      <label className="block text-[10px] text-slate-500 uppercase mb-1">Unit Cost (₦)</label>
                      <input type="number" min="0" value={item.unitCost} onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value))} required className="w-full border border-slate-200 rounded-md text-sm p-2 outline-none focus:border-emerald-500" />
                    </div>
                    <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end items-center gap-4">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Commitment</span>
                <span className="text-lg font-bold text-slate-900">₦{totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Protocol Notes</label>
              <textarea rows={3} placeholder="Add compliance or delivery instructions..." className="w-full border border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white resize-none"></textarea>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors uppercase tracking-wider">
            Cancel
          </button>
          <button type="submit" form="po-form" disabled={isSubmitting} className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors uppercase tracking-wider disabled:opacity-70">
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Generate Order
          </button>
        </div>
      </div>
    </div>
  );
}

// PO DETAIL SIDE PANEL
function PODetailPanel({ po, onClose }: { po: IPurchaseOrder, onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[90] transition-opacity" onClick={onClose} />
      
      {/* Slide-over Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[100] flex flex-col animate-in slide-in-from-right duration-300">
        
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {po.poNumber}
              <span className="px-2 py-0.5 rounded text-[9px] font-bold tracking-widest bg-emerald-100 text-emerald-700 uppercase">
                {po.status}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Created on {new Date(po.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Export PDF">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Vendor Details */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShoppingCart className="w-3 h-3" /> Vendor Node
            </h4>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <p className="text-sm font-bold text-slate-900">{po.vendor.name}</p>
              <p className="text-xs text-slate-500 mt-1">{po.vendor.email}</p>
            </div>
          </div>

          {/* Delivery Details */}
          <div className="grid grid-cols-2 gap-4">
             <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expected By</h4>
              <p className="text-sm font-semibold text-slate-800">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Initiated By</h4>
              <p className="text-sm font-semibold text-slate-800">{po.createdBy.name}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Order Registry Items</h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">Item</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {po.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{item.productName || item.productId}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500">{item.quantityOrdered}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">₦{(item.quantityOrdered * item.unitCost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase text-right tracking-wider">Total Commitment</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-slate-900">₦{Number(po.totalAmount).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
        
        {/* Actions Bottom Bar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between gap-3">
           <button className="flex-1 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors">
            Void Order
          </button>
          <button className="flex-1 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors">
            Receive Goods
          </button>
        </div>
      </div>
    </>
  );
}