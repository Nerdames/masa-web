"use client";

import { useEffect, useMemo, useState } from "react";
import type { BranchProduct, Vendor } from "@/types";
import { useSession } from "next-auth/react";

interface AddProductForm {
  name: string;
  sku: string;
  costPrice: number | "";
  sellingPrice: number | "";
  stock: number | "";
  unit: string;
  vendorId?: string;
  vendorName?: string;
}

interface QuickAddProduct {
  name: string;
  sku: string;
  costPrice: number | "";
  sellingPrice: number | "";
  stock: number | "";
  unit: string;
}

interface AddedProduct extends QuickAddProduct {
  vendorName?: string;
}

export default function CreatePage() {
  const { data: session } = useSession();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<BranchProduct[]>([]);
  const [quickAddRows, setQuickAddRows] = useState<QuickAddProduct[]>([]);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");
  const [submitting, setSubmitting] = useState(false);
  const [addedProducts, setAddedProducts] = useState<AddedProduct[]>([]);

  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);

  const [showVendorModal, setShowVendorModal] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [creatingVendor, setCreatingVendor] = useState(false);

  const [form, setForm] = useState<AddProductForm>({
    name: "",
    sku: "",
    costPrice: "",
    sellingPrice: "",
    stock: "",
    unit: "",
    vendorId: "",
    vendorName: "",
  });

  // -------------------- FETCH VENDORS --------------------
  useEffect(() => {
    if (!session) return;
    fetch("/api/dashboard/products/add?vendorList=true")
      .then((res) => res.json())
      .then((data) => setVendors(data.vendors ?? []))
      .catch(console.error);
  }, [session]);

  // -------------------- FETCH PRODUCTS BY VENDOR --------------------
  useEffect(() => {
    if (!form.vendorId) return;
    fetch(
      `/api/dashboard/products?vendorId=${form.vendorId}${
        session?.branchId ? `&branchId=${session.branchId}` : ""
      }`
    )
      .then((res) => res.json())
      .then((data) => setProducts(data.data ?? []))
      .catch(console.error);
  }, [form.vendorId, session?.branchId]);

  // -------------------- FILTER VENDORS --------------------
  const filteredVendors = useMemo(
    () =>
      vendors.filter((v) =>
        v.name.toLowerCase().includes(vendorSearch.toLowerCase())
      ),
    [vendors, vendorSearch]
  );

  // -------------------- FORM HELPERS --------------------
  const updateField = <K extends keyof AddProductForm>(
    field: K,
    value: AddProductForm[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // -------------------- QUICK ADD HELPERS --------------------
  const addQuickRow = () =>
    setQuickAddRows((prev) => [
      ...prev,
      { name: "", sku: "", costPrice: "", sellingPrice: "", stock: "", unit: "" },
    ]);

  const removeQuickRow = (index: number) =>
    setQuickAddRows((prev) => prev.filter((_, i) => i !== index));

  const updateQuickRow = (
    index: number,
    field: keyof QuickAddProduct,
    value: string | number
  ) => {
    setQuickAddRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // -------------------- ADD TO LIVE LIST --------------------
  const addToLiveList = (product: AddedProduct) => {
    setAddedProducts((prev) => [...prev, product]);
  };

  // -------------------- SKU AUTO-GENERATION --------------------
  useEffect(() => {
    if (!form.name || form.sku) return;
    const abbreviation = form.name
      .split(" ")
      .map((w) => w[0]?.toUpperCase() || "")
      .join("");
    const randomNumber = Math.floor(Math.random() * 9000 + 1000);
    updateField("sku", `${abbreviation}${randomNumber}`);
  }, [form.name]);

  // -------------------- DUPLICATE SKU CHECK --------------------
  const isDuplicateSKU = (sku: string) => {
    const skuUpper = sku.trim().toUpperCase();
    if (addedProducts.some((p) => p.sku?.toUpperCase() === skuUpper)) return true;
    if (
      products.some((p) => (p.product?.sku ?? p.sku)?.toUpperCase() === skuUpper)
    )
      return true;
    return false;
  };

  // -------------------- PREVENT DUPLICATE VENDOR --------------------
  const vendorExists = (name: string) =>
    vendors.some(
      (v) => v.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

  // -------------------- CREATE VENDOR --------------------
  const handleCreateVendor = async () => {
    if (!newVendorName.trim() || !session?.organizationId) return;
    if (vendorExists(newVendorName)) {
      alert("Vendor already exists.");
      return;
    }

    try {
      setCreatingVendor(true);
      const res = await fetch("/api/dashboard/products/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createVendor",
          name: newVendorName,
        }),
      });
      if (!res.ok) throw new Error("Failed to create vendor");
      const data = await res.json();

      setVendors((prev) => [...prev, data.vendor]);
      setForm((prev) => ({
        ...prev,
        vendorId: data.vendor.id,
        vendorName: data.vendor.name,
      }));
      setVendorSearch(data.vendor.name);
      setShowVendorModal(false);
      setNewVendorName("");
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingVendor(false);
    }
  };

  // -------------------- CREATE SINGLE PRODUCT --------------------
  const handleCreateProduct = async () => {
    if (
      !form.name ||
      !form.sku ||
      !form.vendorId ||
      !session?.organizationId ||
      !session?.branchId
    )
      return;

    if (isDuplicateSKU(form.sku)) {
      alert("Duplicate SKU detected! Please use a unique SKU.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/products/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createProducts",
          branchId: session.branchId,
          organizationId: session.organizationId,
          products: [
            {
              name: form.name,
              sku: form.sku,
              costPrice: form.costPrice || 0,
              sellingPrice: form.sellingPrice || 0,
              stock: form.stock || 0,
              unit: form.unit,
              vendorId: form.vendorId,
              vendorName: form.vendorName,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("Failed to create product");
      addToLiveList({ ...form });
      setForm((prev) => ({
        ...prev,
        name: "",
        sku: "",
        costPrice: "",
        sellingPrice: "",
        stock: "",
        unit: "",
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------- BULK CREATE --------------------
  const handleSaveAll = async () => {
    if ((!form.vendorId && !form.vendorName) || !session?.organizationId || !session?.branchId)
      return;
    if (!quickAddRows.length) return;

    const duplicateRows = quickAddRows.filter((row) => isDuplicateSKU(row.sku));
    if (duplicateRows.length) {
      alert(`Duplicate SKUs found: ${duplicateRows.map((r) => r.sku).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/products/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createProducts",
          branchId: session.branchId,
          organizationId: session.organizationId,
          products: quickAddRows.map((row) => ({
            ...row,
            costPrice: row.costPrice || 0,
            sellingPrice: row.sellingPrice || 0,
            stock: row.stock || 0,
            vendorId: form.vendorId,
            vendorName: form.vendorName,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to save products");
      quickAddRows.forEach((row) =>
        addToLiveList({ ...row, vendorName: form.vendorName })
      );
      setQuickAddRows([]);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------- RENDER --------------------
  return (
    <div className="flex gap-6 p-6 h-screen overflow-y-auto overflow-x-hidden">

      {/* LEFT PANEL */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-6">

        {/* VENDOR SELECTION */}
        <div className="space-y-2 relative">
          <label className="text-sm font-semibold text-slate-700">Vendor</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                placeholder="Search vendor..."
                value={vendorSearch}
                onChange={(e) => {
                  setVendorSearch(e.target.value);
                  setShowVendorDropdown(true);
                }}
                onFocus={() => setShowVendorDropdown(true)}
                className="w-full h-12 px-4 border rounded-xl"
              />
              {showVendorDropdown && (
                <div className="absolute w-full bg-white border rounded-xl mt-1 shadow max-h-48 overflow-y-auto z-20">
                  {filteredVendors.length ? (
                    filteredVendors.map((v) => (
                      <div
                        key={v.id}
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            vendorId: v.id,
                            vendorName: v.name,
                          }));
                          setVendorSearch(v.name);
                          setShowVendorDropdown(false);
                        }}
                        className="px-4 py-2 hover:bg-slate-100 cursor-pointer"
                      >
                        {v.name}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-slate-400">No vendors found</div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowVendorModal(true)}
              className="px-4 h-12 bg-slate-900 text-white rounded-xl"
            >
              + New
            </button>
          </div>
          <input
            value={form.vendorName ?? ""}
            readOnly
            className="w-full h-12 px-4 border rounded-xl bg-slate-50"
          />
        </div>

        {/* TABS */}
        <div className="flex gap-4">
          {(["new", "existing"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl ${
                activeTab === tab ? "bg-slate-900 text-white" : "bg-slate-200"
              }`}
            >
              {tab === "new" ? "New Product" : "Existing Products"}
            </button>
          ))}
        </div>

        {/* NEW PRODUCT FORM */}
        {activeTab === "new" && (
          <div className="flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                placeholder="Product Name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="sm:col-span-2 h-12 px-4 border rounded-xl"
              />
              <input
                placeholder="SKU"
                value={form.sku}
                onChange={(e) => updateField("sku", e.target.value)}
                className="h-12 px-4 border rounded-xl"
              />
              <input
                type="number"
                placeholder="Cost Price"
                value={form.costPrice}
                onChange={(e) =>
                  updateField("costPrice", e.target.value === "" ? "" : +e.target.value)
                }
                className="h-12 px-4 border rounded-xl"
              />
              <input
                type="number"
                placeholder="Selling Price"
                value={form.sellingPrice}
                onChange={(e) =>
                  updateField("sellingPrice", e.target.value === "" ? "" : +e.target.value)
                }
                className="h-12 px-4 border rounded-xl"
              />
              <input
                type="number"
                placeholder="Stock"
                value={form.stock}
                onChange={(e) =>
                  updateField("stock", e.target.value === "" ? "" : +e.target.value)
                }
                className="h-12 px-4 border rounded-xl"
              />
              <input
                type="text"
                placeholder="Unit"
                value={form.unit}
                onChange={(e) => updateField("unit", e.target.value)}
                className="h-12 px-4 border rounded-xl"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCreateProduct}
                disabled={submitting}
                className="px-5 h-12 bg-slate-900 text-white rounded-xl"
              >
                {submitting ? "Saving..." : "Create Product"}
              </button>
            </div>

            {/* QUICK ADD */}
            <h4 className="font-semibold">Add Multiple Products</h4>
            {quickAddRows.map((row, i) => (
              <div key={i} className="grid sm:grid-cols-6 gap-2 items-center mb-2">
                <input placeholder="Name" value={row.name} onChange={(e) => updateQuickRow(i, "name", e.target.value)} />
                <input placeholder="SKU" value={row.sku} onChange={(e) => updateQuickRow(i, "sku", e.target.value)} />
                <input type="number" placeholder="Cost Price" value={row.costPrice} onChange={(e) => updateQuickRow(i, "costPrice", e.target.value === "" ? "" : +e.target.value)} />
                <input type="number" placeholder="Selling Price" value={row.sellingPrice} onChange={(e) => updateQuickRow(i, "sellingPrice", e.target.value === "" ? "" : +e.target.value)} />
                <input type="number" placeholder="Stock" value={row.stock} onChange={(e) => updateQuickRow(i, "stock", e.target.value === "" ? "" : +e.target.value)} />
                <input type="text" placeholder="Unit" value={row.unit} onChange={(e) => updateQuickRow(i, "unit", e.target.value)} />
                <button type="button" onClick={() => removeQuickRow(i)} className="text-red-500">Remove</button>
              </div>
            ))}
            <div className="flex gap-3 mt-2">
              <button onClick={addQuickRow}>Add Row</button>
              <button onClick={handleSaveAll} disabled={submitting}>
                {submitting ? "Saving..." : "Save All"}
              </button>
            </div>
          </div>
        )}

        {/* EXISTING PRODUCTS TAB */}
        {activeTab === "existing" && (
          <div className="overflow-y-auto">
            <table className="w-full border border-slate-200 rounded-xl">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 border-b">Name</th>
                  <th className="px-3 py-2 border-b">SKU</th>
                  <th className="px-3 py-2 border-b">Cost</th>
                  <th className="px-3 py-2 border-b">Selling</th>
                  <th className="px-3 py-2 border-b">Stock</th>
                  <th className="px-3 py-2 border-b">Unit</th>
                  <th className="px-3 py-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.length ? products.map((p) => {
                  const name = p.product?.name ?? p.name;
                  const sku = p.product?.sku ?? p.sku;
                  const costPrice = Number(p.costPrice ?? 0);
                  const sellingPrice = Number(p.sellingPrice ?? 0);
                  const stock = p.stock ?? 0;
                  const unit = p.unit ?? "";
                  return (
                    <tr key={p.id} className="text-sm">
                      <td className="px-3 py-2 border-b">{name}</td>
                      <td className="px-3 py-2 border-b">{sku}</td>
                      <td className="px-3 py-2 border-b">{costPrice}</td>
                      <td className="px-3 py-2 border-b">{sellingPrice}</td>
                      <td className="px-3 py-2 border-b">{stock}</td>
                      <td className="px-3 py-2 border-b">{unit}</td>
                      <td className="px-3 py-2 border-b">
                        <button
                          className="text-blue-600"
                          onClick={() => addToLiveList({ name, sku, costPrice, sellingPrice, stock, unit, vendorName: p.vendor?.name ?? form.vendorName })}
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-slate-500 text-center">No products found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <aside className="w-full max-w-md bg-white border rounded-2xl p-6 overflow-y-auto">
        <h3 className="font-semibold mb-4">Live Added Products</h3>
        {addedProducts.length ? (
          <div className="space-y-2">
            {addedProducts.map((p, i) => (
              <div key={i} className="border p-2 rounded-xl">
                <p className="font-semibold">{p.name}</p>
                <p>SKU: {p.sku} | Vendor: {p.vendorName}</p>
                <p>Stock: {p.stock} | Cost: {p.costPrice} | Selling: {p.sellingPrice}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-slate-500">No products added yet.</p>}
      </aside>

      {/* CREATE VENDOR MODAL */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-96">
            <h3 className="font-semibold mb-4">Create New Vendor</h3>
            <input
              placeholder="Vendor Name"
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              className="w-full h-12 px-4 border rounded-xl mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowVendorModal(false)} className="px-4 py-2 rounded-xl border">Cancel</button>
              <button onClick={handleCreateVendor} disabled={creatingVendor} className="px-4 py-2 rounded-xl bg-slate-900 text-white">
                {creatingVendor ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
