"use client";

import { useEffect, useState } from "react";
import { User } from "@/types/user";
import { Product } from "@/types/inventory";
import { Supplier } from "@/types/supplier"; // assume this matches your schema

interface AddProductForm {
  name: string;
  sku: string;
  price: number | "";
  stock: number | "";
  supplierId?: string;
  supplierName?: string;
}

interface QuickAddProduct {
  name: string;
  sku: string;
  price: number | "";
  stock: number | "";
}

export default function CreatePage() {
  const currentUser: User = { id: "1", name: "Admin" }; // placeholder

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<AddProductForm>({
    name: "",
    sku: "",
    price: "",
    stock: "",
    supplierId: "",
    supplierName: "",
  });
  const [quickAddRows, setQuickAddRows] = useState<QuickAddProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");
  const [submitting, setSubmitting] = useState(false);

  // Fetch suppliers
  useEffect(() => {
    fetch("/api/suppliers")
      .then(res => res.json())
      .then(data => setSuppliers(data.suppliers))
      .catch(console.error);
  }, []);

  // Fetch products whenever supplier changes
  useEffect(() => {
    if (!form.supplierId) return;
    fetch(`/api/products?supplierId=${form.supplierId}`)
      .then(res => res.json())
      .then(data => setProducts(data.products))
      .catch(console.error);
  }, [form.supplierId]);

  // Update a field in the form
  const updateField = <K extends keyof AddProductForm>(field: K, value: AddProductForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Quick add row helpers
  const addQuickRow = () => setQuickAddRows(prev => [...prev, { name: "", sku: "", price: "", stock: "" }]);
  const removeQuickRow = (index: number) => setQuickAddRows(prev => prev.filter((_, i) => i !== index));
  const updateQuickRow = (index: number, field: keyof QuickAddProduct, value: string | number) => {
    setQuickAddRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Submit single product
  const handleCreateProduct = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ name: "", sku: "", price: "", stock: "", supplierId: "", supplierName: "" });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit multiple quick-add products
  const handleSaveAll = async () => {
    setSubmitting(true);
    try {
      await Promise.all(
        quickAddRows.map(row =>
          fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...row, supplierId: form.supplierId, supplierName: form.supplierName }),
          })
        )
      );
      setQuickAddRows([]);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Group products by supplier
  const groupedProducts = products.reduce<Record<string, Product[]>>((acc, p) => {
    const key = p.supplierId ?? "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <div className="flex gap-6 p-6">
      {/* LEFT: Add Product */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col">
        {/* Supplier select */}
        <div className="mb-4 flex flex-col gap-2">
          <label className="block text-sm font-semibold text-slate-700">Supplier</label>
          <select
            value={form.supplierId ?? ""}
            onChange={e => {
              const selected = suppliers.find(s => s.id === e.target.value);
              setForm(prev => ({ ...prev, supplierId: selected?.id, supplierName: selected?.name }));
            }}
            className="w-full h-12 px-4 border border-slate-300 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-slate-300 focus:outline-none"
          >
            <option value="">Select Supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <input
            type="text"
            placeholder="Or add new supplier"
            value={form.supplierName}
            onChange={e => updateField("supplierName", e.target.value)}
            className="w-full h-12 px-4 border border-slate-300 rounded-xl bg-white text-slate-800 hover:border-slate-400 focus:ring-2 focus:ring-slate-300 focus:outline-none"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setActiveTab("new")}
            className={`px-4 py-2 rounded-xl transition ${activeTab === "new" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
          >
            New Product
          </button>
          <button
            onClick={() => setActiveTab("existing")}
            className={`px-4 py-2 rounded-xl transition ${activeTab === "existing" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
          >
            Existing Products
          </button>
        </div>

        {activeTab === "new" && (
          <>
            {/* Single Add */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Product Name" className="col-span-2 h-12 px-4 border rounded-xl" />
              <input value={form.sku} onChange={e => updateField("sku", e.target.value)} placeholder="SKU" className="h-12 px-4 border rounded-xl" />
              <input type="number" min={0} step={0.01} value={form.price} onChange={e => updateField("price", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Price" className="h-12 px-4 border rounded-xl" />
              <input type="number" min={0} step={1} value={form.stock} onChange={e => updateField("stock", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Stock" className="h-12 px-4 border rounded-xl" />
            </div>

            <div className="flex gap-3 justify-end mb-6">
              <button onClick={handleCreateProduct} disabled={submitting} className="px-5 h-12 bg-slate-900 text-white rounded-xl">
                {submitting ? "Saving..." : "Create Product"}
              </button>
            </div>

            {/* Quick Add */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold mb-3 border-b pb-1">Add Multiple Products</h4>
              <div className="flex flex-col gap-3">
                {quickAddRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center p-2 border rounded-xl">
                    <input type="text" value={row.name} onChange={e => updateQuickRow(idx, "name", e.target.value)} placeholder="Name" className="h-12 px-3 border rounded-xl" />
                    <input type="text" value={row.sku} onChange={e => updateQuickRow(idx, "sku", e.target.value)} placeholder="SKU" className="h-12 px-3 border rounded-xl" />
                    <input type="number" min={0} step={0.01} value={row.price} onChange={e => updateQuickRow(idx, "price", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Price" className="h-12 px-3 border rounded-xl" />
                    <input type="number" min={0} step={1} value={row.stock} onChange={e => updateQuickRow(idx, "stock", e.target.value === "" ? "" : Number(e.target.value))} placeholder="Stock" className="h-12 px-3 border rounded-xl" />
                    <button onClick={() => removeQuickRow(idx)} className="px-2 py-3.5 bg-red-500 text-white rounded-xl">Remove</button>
                  </div>
                ))}

                <div className="flex gap-3 mt-2">
                  <button onClick={addQuickRow} className="px-4 py-2 bg-slate-200 rounded-xl">Add Row</button>
                  <button onClick={handleSaveAll} className="px-4 py-2 bg-slate-900 text-white rounded-xl">
                    {submitting ? "Saving..." : "Save All"}
                  </button>
                </div>
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
                    <div key={p.id} className="flex justify-between p-2 border-b last:border-b-0 rounded">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.sku}</div>
                        <div className="text-xs text-slate-400">Stock: {p.stock}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-sm font-medium">₦{p.sellingPrice.toFixed(2)}</div>
                        <button onClick={() => setForm({ name: p.name, sku: p.sku, price: p.sellingPrice, stock: p.stock, supplierId: p.supplierId, supplierName: supplier?.name })} className="text-sm px-3 py-1 bg-slate-900 text-white rounded-lg">
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
