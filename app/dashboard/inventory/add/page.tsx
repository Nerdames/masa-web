"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { useRouter } from "next/navigation";
import type { Product, ProductTag, Supplier, Category } from "@/types";

interface AddProductForm {
  name: string;
  sku: string;
  costPrice: number | "";
  sellingPrice: number | "";
  stock: number | "";
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
}

interface QuickAddProduct {
  name: string;
  sku: string;
  costPrice: number | "";
  sellingPrice: number | "";
  stock: number | "";
  categoryId?: string;
}

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then(res => res.json());

export default function AddProductPage() {
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = useState<AddProductForm>({
    name: "",
    sku: "",
    costPrice: "",
    sellingPrice: "",
    stock: "",
    supplierId: "",
    supplierName: "",
    categoryId: "",
  });

  const [quickAddRows, setQuickAddRows] = useState<QuickAddProduct[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");
  const [submitting, setSubmitting] = useState(false);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<"ALL" | "LOW_STOCK" | "OUT_OF_STOCK" | "DISCONTINUED" | "HOT">("ALL");
  const [sortOrder, setSortOrder] = useState<"az" | "newest" | "">("");

  const debouncedSearch = useDebounce(search, 400);

  // Fetch suppliers & categories
  const { data: suppliersData } = useSWR<{ suppliers: Supplier[] }>("/api/dashboard/products", fetcher);
  const { data: categoriesData } = useSWR<{ categories: Category[] }>("/api/dashboard/products", fetcher);

  const suppliers = suppliersData?.suppliers ?? [];
  const categories = categoriesData?.categories ?? [];

  // Build query string for products API
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (form.supplierId) params.set("supplierId", form.supplierId);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortOrder) params.set("sort", sortOrder);
    if (filterTag !== "ALL") params.set("tag", filterTag);
    return params.toString();
  }, [form.supplierId, debouncedSearch, sortOrder, filterTag]);

  const { data: productsData, mutate } = useSWR<{ products: Product[] }>(
    `/api/dashboard/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products = productsData?.products ?? [];

  // ---------- Helpers ----------
  const updateField = <K extends keyof AddProductForm>(field: K, value: AddProductForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const addQuickRow = () =>
    setQuickAddRows(prev => [...prev, { name: "", sku: "", costPrice: "", sellingPrice: "", stock: "", categoryId: "" }]);
  const removeQuickRow = (index: number) =>
    setQuickAddRows(prev => prev.filter((_, i) => i !== index));
  const updateQuickRow = (index: number, field: keyof QuickAddProduct, value: string | number) => {
    setQuickAddRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // ---------- Single Add ----------
  const handleCreateProduct = async () => {
    if (!form.supplierId && !form.supplierName) return alert("Select or add a supplier");
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, organizationId: "1" }),
      });
      const newProduct: Product = await res.json();
      if (!newProduct.id) throw new Error("Failed");

      // Highlight new product
      setHighlightedProductId(newProduct.id);

      // Reset form
      setForm({ ...form, name: "", sku: "", costPrice: "", sellingPrice: "", stock: "", categoryId: "" });

      // Update SWR cache locally
      mutate(prev => ({
        ...prev,
        products: [newProduct, ...(prev?.products ?? [])],
      }), false);

      setTimeout(() => setHighlightedProductId(null), 2000);
    } catch (err) {
      console.error(err);
      alert("Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Quick Add ----------
  const handleSaveAll = async () => {
    if (!form.supplierId && !form.supplierName) return alert("Select or add a supplier");
    if (quickAddRows.length === 0) return;

    setSubmitting(true);
    try {
      const createdProducts: Product[] = [];
      for (const row of quickAddRows) {
        const res = await fetch("/api/dashboard/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...row,
            supplierId: form.supplierId,
            supplierName: form.supplierName,
            organizationId: "1",
          }),
        });
        const prod: Product = await res.json();
        if (prod.id) createdProducts.push(prod);
      }

      // Append new products
      mutate(prev => ({
        ...prev,
        products: [...createdProducts, ...(prev?.products ?? [])],
      }), false);

      setQuickAddRows([]);
    } catch (err) {
      console.error(err);
      alert("Failed to save products");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Group products by supplier ----------
  const groupedProducts = useMemo(() => {
    return products.reduce<Record<string, Product[]>>((acc, p) => {
      const key = p.supplierId ?? "unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});
  }, [products]);

  // ---------- Stock Text Color ----------
  const stockTextClass = (tag?: ProductTag | null) => {
    if (tag === "OUT_OF_STOCK") return "text-red-700";
    if (tag === "LOW_STOCK") return "text-yellow-700";
    return "text-gray-900";
  };

  // ---------- Render ----------
  if (!suppliersData || !categoriesData) return <div>Loading...</div>;

  return (
    <div className="flex gap-6 p-6">
      {/* LEFT: Add / Quick Add */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col">
        {/* Supplier */}
        <div className="mb-4 flex flex-col gap-2">
          <label className="block text-sm font-semibold text-slate-700">Supplier</label>
          <select
            value={form.supplierId ?? ""}
            onChange={e => {
              const s = suppliers.find(s => s.id === e.target.value);
              setForm(prev => ({ ...prev, supplierId: s?.id, supplierName: s?.name }));
            }}
            className="w-full h-12 px-4 border rounded-xl"
          >
            <option value="">Select Supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input
            type="text"
            placeholder="Or add new supplier"
            value={form.supplierName}
            onChange={e => updateField("supplierName", e.target.value)}
            className="w-full h-12 px-4 border rounded-xl"
          />
        </div>

        {/* Category */}
        <div className="mb-4 flex flex-col gap-2">
          <label className="block text-sm font-semibold text-slate-700">Category</label>
          <select
            value={form.categoryId ?? ""}
            onChange={e => updateField("categoryId", e.target.value)}
            className="w-full h-12 px-4 border rounded-xl"
          >
            <option value="">Select Category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setActiveTab("new")}
            className={`px-4 py-2 rounded-xl ${activeTab === "new" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}
          >
            New Product
          </button>
          <button
            onClick={() => setActiveTab("existing")}
            className={`px-4 py-2 rounded-xl ${activeTab === "existing" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}
          >
            Existing Products
          </button>
        </div>

        {activeTab === "new" && (
          <>
            {/* Single Add */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Name" className="h-12 px-4 border rounded-xl" />
              <input value={form.sku} onChange={e => updateField("sku", e.target.value)} placeholder="SKU" className="h-12 px-4 border rounded-xl" />
              <input type="number" min={0} value={form.costPrice} onChange={e => updateField("costPrice", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Cost Price" className="h-12 px-4 border rounded-xl" />
              <input type="number" min={0} value={form.sellingPrice} onChange={e => updateField("sellingPrice", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Selling Price" className="h-12 px-4 border rounded-xl" />
              <input type="number" min={0} value={form.stock} onChange={e => updateField("stock", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Stock" className="h-12 px-4 border rounded-xl" />
            </div>
            <div className="flex justify-end gap-3 mb-6">
              <button onClick={handleCreateProduct} disabled={submitting} className="px-5 h-12 bg-slate-900 text-white rounded-xl">{submitting ? "Saving..." : "Create Product"}</button>
            </div>

            {/* Quick Add */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold mb-3 border-b pb-1">Add Multiple Products</h4>
              {quickAddRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center p-2 border rounded-xl">
                  <input type="text" value={row.name} onChange={e => updateQuickRow(idx, "name", e.target.value)} placeholder="Name" className="h-12 px-3 border rounded-xl" />
                  <input type="text" value={row.sku} onChange={e => updateQuickRow(idx, "sku", e.target.value)} placeholder="SKU" className="h-12 px-3 border rounded-xl" />
                  <input type="number" min={0} value={row.costPrice} onChange={e => updateQuickRow(idx, "costPrice", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Cost Price" className="h-12 px-3 border rounded-xl" />
                  <input type="number" min={0} value={row.sellingPrice} onChange={e => updateQuickRow(idx, "sellingPrice", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Selling Price" className="h-12 px-3 border rounded-xl" />
                  <input type="number" min={0} value={row.stock} onChange={e => updateQuickRow(idx, "stock", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Stock" className="h-12 px-3 border rounded-xl" />
                  <select value={row.categoryId ?? ""} onChange={e => updateQuickRow(idx, "categoryId", e.target.value)} className="h-12 px-3 border rounded-xl">
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => removeQuickRow(idx)} className="px-2 py-3.5 bg-red-500 text-white rounded-xl">Remove</button>
                </div>
              ))}
              <div className="flex gap-3 mt-2">
                <button onClick={addQuickRow} className="px-4 py-2 bg-slate-200 rounded-xl">Add Row</button>
                <button onClick={handleSaveAll} className="px-4 py-2 bg-slate-900 text-white rounded-xl">{submitting ? "Saving..." : "Save All"}</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* RIGHT: Existing Products */}
      <section className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl p-6 flex flex-col">
        <h3 className="text-xl font-semibold mb-4">Products by Supplier</h3>
        <div className="flex-1 overflow-auto space-y-3">
          {Object.entries(groupedProducts).map(([supplierId, prods]) => {
            const supplier = suppliers.find(s => s.id === supplierId);
            return (
              <div key={supplierId} className="p-3 border rounded-xl">
                <div className="font-semibold mb-2">{supplier?.name ?? "Unknown Supplier"}</div>
                <div className="flex flex-col gap-1">
                  {prods.map(p => (
                    <div key={p.id} className={`flex justify-between p-2 border-b last:border-b-0 rounded transition ${highlightedProductId === p.id ? "bg-green-100 border-green-400" : ""}`}>
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.sku}</div>
                        <div className={`text-xs ${stockTextClass(p.tag)}`}>
                          Stock: {p.stock ?? 0} | Category: {categories.find(c => c.id === p.categoryId)?.name ?? "-"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-sm font-medium">₦{(p.sellingPrice ?? 0).toFixed(2)}</div>
                        <button
                          onClick={() =>
                            setForm({
                              name: p.name,
                              sku: p.sku,
                              costPrice: p.costPrice ?? "",
                              sellingPrice: p.sellingPrice ?? "",
                              stock: p.stock ?? "",
                              supplierId: p.supplierId,
                              supplierName: supplier?.name,
                              categoryId: p.categoryId,
                            })
                          }
                          className="text-sm px-3 py-1 bg-slate-900 text-white rounded-lg"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {products.length === 0 && <div className="text-slate-500">No products found</div>}
        </div>
      </section>
    </div>
  );
}
