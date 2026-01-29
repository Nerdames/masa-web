"use client";

import { useEffect, useState } from "react";
import type { InventoryProduct } from "@/types";
import type { Supplier } from "@/types";

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [quickAddRows, setQuickAddRows] = useState<QuickAddProduct[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<AddProductForm>({
    name: "",
    sku: "",
    price: "",
    stock: "",
    supplierId: "",
    supplierName: "",
  });

  // ------------------------------ FETCH SUPPLIERS ------------------------------
  useEffect(() => {
    fetch("/api/suppliers")
      .then(res => res.json())
      .then(data => setSuppliers(data.suppliers ?? []))
      .catch(console.error);
  }, []);

  // ------------------------------ FETCH PRODUCTS BY SUPPLIER ------------------------------
  useEffect(() => {
    if (!form.supplierId) return;

    fetch(`/api/dashboard/products?supplierId=${form.supplierId}`)
      .then(res => res.json())
      .then(data => setProducts(data.data ?? []))
      .catch(console.error);
  }, [form.supplierId]);

  // ------------------------------ FORM HELPERS ------------------------------
  const updateField = <K extends keyof AddProductForm>(
    field: K,
    value: AddProductForm[K]
  ) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // ------------------------------ QUICK ADD HELPERS ------------------------------
  const addQuickRow = () =>
    setQuickAddRows(prev => [...prev, { name: "", sku: "", price: "", stock: "" }]);

  const removeQuickRow = (index: number) =>
    setQuickAddRows(prev => prev.filter((_, i) => i !== index));

  const updateQuickRow = (
    index: number,
    field: keyof QuickAddProduct,
    value: string | number
  ) => {
    setQuickAddRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // ------------------------------ CREATE SINGLE PRODUCT ------------------------------
  const handleCreateProduct = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      setForm({
        name: "",
        sku: "",
        price: "",
        stock: "",
        supplierId: form.supplierId,
        supplierName: form.supplierName,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------ BULK CREATE ------------------------------
  const handleSaveAll = async () => {
    if (!form.supplierId && !form.supplierName) return;

    setSubmitting(true);
    try {
      await Promise.all(
        quickAddRows.map(row =>
          fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...row,
              supplierId: form.supplierId,
              supplierName: form.supplierName,
            }),
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

  // ------------------------------ GROUP PRODUCTS ------------------------------
  const groupedProducts = products.reduce<Record<string, InventoryProduct[]>>(
    (acc, p) => {
      const key = p.supplier?.id ?? "unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    },
    {}
  );

  // ------------------------------ RENDER ------------------------------
  return (
    <div className="flex gap-6 p-6">
      {/* LEFT */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6">
        {/* Supplier */}
        <div className="mb-4 space-y-2">
          <label className="text-sm font-semibold text-slate-700">Supplier</label>

          <select
            value={form.supplierId ?? ""}
            onChange={e => {
              const s = suppliers.find(x => x.id === e.target.value);
              setForm(prev => ({
                ...prev,
                supplierId: s?.id,
                supplierName: s?.name,
              }));
            }}
            className="w-full h-12 px-4 border rounded-xl"
          >
            <option value="">Select Supplier</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Or add new supplier"
            value={form.supplierName ?? ""}
            onChange={e => updateField("supplierName", e.target.value)}
            className="w-full h-12 px-4 border rounded-xl"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-4">
          {(["new", "existing"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl ${
                activeTab === tab
                  ? "bg-slate-900 text-white"
                  : "bg-slate-200"
              }`}
            >
              {tab === "new" ? "New Product" : "Existing Products"}
            </button>
          ))}
        </div>

        {activeTab === "new" && (
          <>
            {/* Single */}
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              <input
                className="sm:col-span-2 h-12 px-4 border rounded-xl"
                placeholder="Product Name"
                value={form.name}
                onChange={e => updateField("name", e.target.value)}
              />
              <input
                className="h-12 px-4 border rounded-xl"
                placeholder="SKU"
                value={form.sku}
                onChange={e => updateField("sku", e.target.value)}
              />
              <input
                type="number"
                className="h-12 px-4 border rounded-xl"
                placeholder="Price"
                value={form.price}
                onChange={e =>
                  updateField("price", e.target.value === "" ? "" : +e.target.value)
                }
              />
              <input
                type="number"
                className="h-12 px-4 border rounded-xl"
                placeholder="Stock"
                value={form.stock}
                onChange={e =>
                  updateField("stock", e.target.value === "" ? "" : +e.target.value)
                }
              />
            </div>

            <div className="flex justify-end mb-6">
              <button
                disabled={submitting}
                onClick={handleCreateProduct}
                className="px-5 h-12 bg-slate-900 text-white rounded-xl"
              >
                {submitting ? "Saving..." : "Create Product"}
              </button>
            </div>

            {/* Quick Add */}
            <h4 className="font-semibold mb-3">Add Multiple Products</h4>

            {quickAddRows.map((row, i) => (
              <div key={i} className="grid sm:grid-cols-5 gap-2 mb-2">
                <input value={row.name} onChange={e => updateQuickRow(i, "name", e.target.value)} />
                <input value={row.sku} onChange={e => updateQuickRow(i, "sku", e.target.value)} />
                <input type="number" value={row.price} onChange={e => updateQuickRow(i, "price", +e.target.value)} />
                <input type="number" value={row.stock} onChange={e => updateQuickRow(i, "stock", +e.target.value)} />
                <button onClick={() => removeQuickRow(i)}>Remove</button>
              </div>
            ))}

            <div className="flex gap-3 mt-3">
              <button onClick={addQuickRow}>Add Row</button>
              <button onClick={handleSaveAll} disabled={submitting}>
                {submitting ? "Saving..." : "Save All"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* RIGHT */}
      <aside className="w-full max-w-md bg-white border rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Products by Supplier</h3>

        {Object.entries(groupedProducts).map(([supplierId, prods]) => (
          <div key={supplierId} className="mb-4">
            <div className="font-semibold mb-2">
              {prods[0]?.supplier?.name ?? "Unknown Supplier"}
            </div>

            {prods.map(p => (
              <div key={p.id} className="flex justify-between border-b py-2">
                <div>
                  <div>{p.name}</div>
                  <div className="text-xs text-slate-500">{p.sku}</div>
                  <div className="text-xs">Stock: {p.stock}</div>
                </div>

                <div className="text-right">
                  <div>₦{p.sellingPrice.toFixed(2)}</div>
                  <button
                    onClick={() =>
                      setForm({
                        name: p.name,
                        sku: p.sku,
                        price: p.sellingPrice,
                        stock: p.stock,
                        supplierId: p.supplier?.id,
                        supplierName: p.supplier?.name,
                      })
                    }
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {!products.length && <div className="text-slate-500">No products found</div>}
      </aside>
    </div>
  );
}
