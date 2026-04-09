"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useDebounce } from "@/core/hooks/useDebounce";

// UI Components & Layout
import Summary, { SummaryCard } from "@/core/components/ui/Summary";
import DataTable, { DataTableColumn, FilterConfig, SortOption } from "@/core/components/ui/DataTable";
import ConfirmModal from "@/core/components/modal/ConfirmModal"; 
import { useSidePanel } from "@/core/components/layout/SidePanelContext"; // Added

// Side Panels & Modals
import { ProductDetailsPanel } from "@/modules/inventory/components/ProductDetailsPanel"; // Added
import AddInventoryModal from "@/modules/inventory/components/AddInventoryModal";
import EditInventoryModal from "@/modules/inventory/components/EditInventoryModal";

// Actions & Types
import { getCategories } from "@/modules/actions/inventory";
import type { ProductsResponse, InventoryProduct } from "@/app/actions/inventory";
import { useAlerts } from "@/core/components/feedback/AlertProvider";

/* ================= CONFIG ================= */
const ALL_TAGS = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"];
const SORT_OPTIONS: SortOption[] = [
  { label: "Newest First", value: "id_desc" },
  { label: "Name (A-Z)", value: "name_asc" },
  { label: "Name (Z-A)", value: "name_desc" },
  { label: "Price (Low to High)", value: "price_asc" },
  { label: "Price (High to Low)", value: "price_desc" },
  { label: "Stock (Low to High)", value: "stock_asc" },
  { label: "Stock (High to Low)", value: "stock_desc" },
];

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then(res => res.json());

export default function InventoryPage() {
  const { dispatch } = useAlerts();
  const { openPanel, closePanel, isOpen } = useSidePanel(); // Side Panel Hook

  /* ---------------- State ---------------- */
  const [search, setSearch] = useState("");
  const [tagFilterArray, setTagFilterArray] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<string | undefined>("id_desc");
  
  // Highlighting & Modal States
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryProduct | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Delete State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<InventoryProduct[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Initial Data ---------------- */
  useEffect(() => {
    getCategories().then(setCategories);
    return () => closePanel(); // Cleanup on unmount
  }, [closePanel]);

  /* ---------------- Data Fetching ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    return params.toString();
  }, [debouncedSearch, categoryFilter]);

  const { data, isLoading, mutate, isValidating } = useSWR<ProductsResponse>(
    `/api/dashboard/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products = data?.data ?? [];

  /* ---------------- Enrichment & Sorting ---------------- */
  const enrichedProducts = useMemo(() => {
    return products.map((p) => {
      const stock = p.stock ?? 0;
      const reorderLevel = p.reorderLevel ?? 5;
      let tag = "IN_STOCK";
      if (stock <= 0) tag = "OUT_OF_STOCK";
      else if (stock <= reorderLevel) tag = "LOW_STOCK";
      return { ...p, tag };
    });
  }, [products]);

  const sortedProducts = useMemo(() => {
    let list = [...enrichedProducts];
    if (tagFilterArray.length > 0) {
      list = list.filter((p) => p.tag && tagFilterArray.includes(p.tag));
    }
    if (!sortOrder) return list;
    return list.sort((a, b) => {
      switch (sortOrder) {
        case "name_asc": return a.product.name.localeCompare(b.product.name);
        case "name_desc": return b.product.name.localeCompare(a.product.name);
        case "price_asc": return (a.sellingPrice ?? 0) - (b.sellingPrice ?? 0);
        case "price_desc": return (b.sellingPrice ?? 0) - (a.sellingPrice ?? 0);
        case "stock_asc": return (a.stock ?? 0) - (b.stock ?? 0);
        case "stock_desc": return (b.stock ?? 0) - (a.stock ?? 0);
        default: return 0;
      }
    });
  }, [enrichedProducts, tagFilterArray, sortOrder]);

  /* ---------------- Metrics ---------------- */
  const metrics = useMemo(() => {
    const totalQty = enrichedProducts.reduce((acc, p) => acc + (p.stock ?? 0), 0);
    const totalVal = enrichedProducts.reduce((acc, p) => acc + (p.stock ?? 0) * (p.sellingPrice ?? 0), 0);
    const lowStock = enrichedProducts.filter(p => p.tag === "LOW_STOCK").length;
    return { totalQty, totalVal, lowStock };
  }, [enrichedProducts]);

  /* ---------------- Handlers ---------------- */
  const handleClosePanel = useCallback(() => {
    closePanel();
    setSelectedItemId(null);
  }, [closePanel]);

  const handleUpdate = async (id: string, payload: Partial<InventoryProduct>) => {
    try {
      const res = await fetch("/api/dashboard/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload })
      });
      if (!res.ok) throw new Error("Failed to update");
      await mutate();
      
      // Refresh panel data if it's currently open
      const updatedItem = sortedProducts.find(p => p.id === id);
      if (updatedItem && isOpen) {
        handleOpenDetails({ ...updatedItem, ...payload });
      }
    } catch (err) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Update Failed", message: "Could not save changes." });
    }
  };

  const handleOpenDetails = (item: InventoryProduct) => {
    setSelectedItemId(item.id);
    openPanel(
      <ProductDetailsPanel 
        item={item as any} 
        onClose={handleClosePanel} 
        onUpdate={handleUpdate} 
        onDelete={async (id) => initiateDelete(item)} 
      />
    );
  };

  const initiateDelete = useCallback((item: InventoryProduct) => {
    setItemsToDelete([item]);
    setIsDeleteConfirmOpen(true);
  }, []);

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      const ids = itemsToDelete.map(i => i.id);
      const res = await fetch("/api/dashboard/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error("Deletion failed");
      
      handleClosePanel();
      mutate();
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Deleted", message: `${ids.length} items removed.` });
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      setItemsToDelete([]);
    }
  };

  /* ---------------- Table Columns ---------------- */
  const columns: DataTableColumn<InventoryProduct>[] = useMemo(() => [
    {
      key: "name",
      header: "Product Name",
      render: (p) => <span className="font-bold text-slate-900 uppercase text-[13px]">{p.product.name}</span>,
    },
    {
      key: "sku",
      header: "SKU",
      render: (p) => <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{p.product.sku || "N/A"}</span>,
    },
    { 
      key: "category", 
      header: "Category", 
      render: (p) => <span className="text-slate-500 font-medium text-[13px]">{p.product.category?.name ?? "General"}</span> 
    },
    {
      key: "sellingPrice",
      header: "Unit Price",
      render: (p) => <span className="text-emerald-600 font-bold tabular-nums text-[13px]">₦{(p.sellingPrice ?? 0).toLocaleString()}</span>,
      align: "right"
    },
    {
      key: "stock",
      header: "Qty",
      render: (p) => (
        <span className={`text-[13px] font-black tabular-nums ${(p.stock ?? 0) <= (p.reorderLevel ?? 5) ? "text-rose-500" : "text-slate-700"}`}>
          {p.stock} <span className="text-[10px] text-slate-400 font-normal">{p.unit || 'pcs'}</span>
        </span>
      ),
      align: "right"
    },
    {
      key: "status",
      header: "Status",
      render: (p) => (
        <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase ${
          p.tag === 'LOW_STOCK' ? 'bg-amber-50 text-amber-600 border-amber-200' : 
          p.tag === 'OUT_OF_STOCK' ? 'bg-rose-50 text-rose-600 border-rose-200' :
          'bg-emerald-50 text-emerald-600 border-emerald-200'
        }`}>
          {(p.tag || "").replace(/_/g, " ")}
        </span>
      ),
      align: "center"
    },
  ], []);

  return (
    <div className="flex flex-col gap-6 pt-4 pb-10 px-4 min-h-screen bg-[#F8FAFC]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter leading-none">Inventory</h3>
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="p-3 px-3 rounded-xl bg-[#3D5AFE] text-white text-[14px] font-black hover:bg-[#2A48E0] transition-all shadow-xl shadow-blue-500/25 active:scale-95 flex items-center gap-2"
        >
          <i className="bx bx-plus text-lg" /> Add New Item
        </button>
      </div>

      <Summary cardsData={[
        { id: "totalQuantity", title: "Global Units", value: metrics.totalQty.toLocaleString() },
        { id: "totalValue", title: "Asset Valuation", value: `₦${metrics.totalVal.toLocaleString()}` },
        { id: "lowStock", title: "Alerts Required", value: metrics.lowStock },
      ]} loading={isLoading} />

      <DataTable<InventoryProduct>
        tableId="inventory-personnel-registry"
        data={sortedProducts}
        columns={columns}
        loading={isLoading}
        enableSelection={true}
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => mutate()}
        refreshing={isValidating}
        filters={[
          {
            label: "Stock Status",
            value: tagFilterArray,
            options: ALL_TAGS.map(t => ({ value: t, label: t.replace(/_/g, " ") })),
            onChange: (val) => setTagFilterArray((val as string[]) || []),
          },
          {
            label: "Category",
            value: categoryFilter || "",
            options: categories.map(c => ({ label: c.name, value: c.id })),
            onChange: (val) => setCategoryFilter((val as string) || undefined),
          }
        ]}
        sortOrder={sortOrder}
        sortOptions={SORT_OPTIONS}
        onSortChange={setSortOrder}
        getRowId={(p) => p.id}
        
        // UI Interaction
        onRowClick={handleOpenDetails} 
        onEdit={(p) => {
          setSelectedItem(p);
          setIsEditOpen(true);
        }}
        onDelete={initiateDelete}
        
        // Highlighting active row
        rowClassName={(p) => selectedItemId === p.id ? "bg-blue-50/50" : ""}
      />

      {/* Modals */}
      <AddInventoryModal isOpen={isAddOpen} onClose={() => { setIsAddOpen(false); mutate(); }} categories={categories} />
      
      {selectedItem && (
        <EditInventoryModal isOpen={isEditOpen} onClose={() => { setIsEditOpen(false); setSelectedItem(null); mutate(); }} item={selectedItem} />
      )}

      <ConfirmModal
        open={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={executeDelete}
        loading={isDeleting}
        destructive={true}
        title="Delete Item"
        message={`Are you sure you want to delete "${itemsToDelete[0]?.product.name}"?`}
      />
    </div>
  );
}