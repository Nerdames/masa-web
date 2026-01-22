"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Tooltip } from "@/components/feedback/Tooltip";
import type { Customer, CustomerType } from "@/types/customer";

/* ---------------- SKELETON ROW ---------------- */
const SkeletonRow = () => (
  <tr className="animate-pulse h-16 cursor-pointer">
    <td className="p-2"><div className="w-4 h-4 bg-gray-200 rounded" /></td>
    {Array.from({ length: 4 }).map((_, i) => (
      <td key={i} className="p-2"><div className="h-4 bg-gray-200 rounded w-24" /></td>
    ))}
  </tr>
);

/* ---------------- MINIMUM LOADING ---------------- */
const minLoading = async (fn: () => Promise<void>, delay = 400) => {
  const start = Date.now();
  await fn();
  const elapsed = Date.now() - start;
  if (elapsed < delay) await new Promise(res => setTimeout(res, delay - elapsed));
};

export default function CustomersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();
  const organizationId = session?.user.organizationId ?? "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const [typeFilter, setTypeFilter] = useState<"ALL" | CustomerType>("ALL");
  const [page, setPage] = useState<number>(1);
  const perPage = 12;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [ctype, setCtype] = useState<CustomerType>("BUYER");
  const [saving, setSaving] = useState<boolean>(false);

  const [bulkEditOpen, setBulkEditOpen] = useState<boolean>(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);
  const [bulkType, setBulkType] = useState<CustomerType>("BUYER");

  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  /* ---------------- FETCH CUSTOMERS ---------------- */
  const fetchList = useCallback(async (pageIndex: number = 1) => {
    if (!organizationId) return;

    await minLoading(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (typeFilter !== "ALL") params.set("type", typeFilter);
        params.set("page", String(pageIndex));
        params.set("perPage", String(perPage));
        params.set("organizationId", organizationId);
        if (searchQuery.trim()) params.set("search", searchQuery.trim());

        // Updated endpoint
        const res = await fetch(`/api/dashboard/customers?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load customers");

        const json: { customers: Customer[]; total: number } = await res.json();
        setCustomers(json.customers ?? []);
        setTotal(json.total ?? 0);
        setSelectedIds(new Set());
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
        setCustomers([]);
        setSelectedIds(new Set());
        setTotal(0);
      } finally {
        setLoading(false);
      }
    });
  }, [typeFilter, perPage, organizationId, searchQuery, toast]);

  useEffect(() => { fetchList(1); }, [fetchList]);

  /* ---------------- PAGINATION ---------------- */
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return customers.slice(start, start + perPage);
  }, [customers, page, perPage]);

  /* ---------------- SELECTION ---------------- */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === customers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(customers.map(c => c.id)));
  };

  /* ---------------- CREATE / EDIT ---------------- */
  const openCreate = () => { setEditing(null); setName(""); setEmail(""); setPhone(""); setCtype("BUYER"); setCreateOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setName(c.name); setEmail(c.email ?? ""); setPhone(c.phone ?? ""); setCtype(c.type); setCreateOpen(true); };

  const handleSave = async () => {
    if (!name.trim()) return toast.addToast({ type: "error", message: "Name required" });
    setSaving(true);
    try {
      const payload = { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, type: ctype };
      const res = editing
        ? await fetch(`/api/dashboard/customers/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/dashboard/customers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, organizationId }) });
      if (!res.ok) throw new Error("Save failed");
      toast.addToast({ type: "success", message: editing ? "Customer updated" : "Customer created" });
      setCreateOpen(false);
      await fetchList(1);
    } catch (err: unknown) {
      toast.addToast({ type: "error", message: (err as Error).message });
    } finally { setSaving(false); }
  };

  /* ---------------- DELETE ---------------- */
  const handleDelete = async (id: string) => {
    await minLoading(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/customers/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        toast.addToast({ type: "success", message: "Customer deleted" });
        await fetchList(page);
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally { setLoading(false); }
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    await minLoading(async () => {
      setLoading(true);
      try {
        await Promise.all([...selectedIds].map(id => fetch(`/api/dashboard/customers/${id}`, { method: "DELETE" })));
        toast.addToast({ type: "success", message: "Selected customers deleted" });
        setSelectedIds(new Set());
        await fetchList(page);
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally { setLoading(false); }
    });
  };

  const handleBulkEditType = async () => {
    if (!selectedIds.size) return toast.addToast({ type: "error", message: "No customers selected" });
    setBulkEditOpen(false);
    await minLoading(async () => {
      setLoading(true);
      try {
        await Promise.all([...selectedIds].map(id =>
          fetch(`/api/dashboard/customers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: bulkType }) })
        ));
        toast.addToast({ type: "success", message: "Customer types updated" });
        await fetchList(page);
      } catch (err: unknown) {
        toast.addToast({ type: "error", message: (err as Error).message });
      } finally { setLoading(false); }
    });
  };


  /* ---------------- RENDER ---------------- */
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] space-y-4">
      {/* ---------------- TOP MENU + FILTER + SEARCH ---------------- */}
      <div className="sticky top-0 z-20 bg-white flex justify-between items-center w-full gap-4 p-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
{/* Type Filter Capsule */}
<div className="flex rounded-full bg-gray-100 h-10 w-72 overflow-hidden">
  {(["ALL", "BUYER", "SUPPLIER"] as const).map((ft, idx) => {
    const isSelected = typeFilter === ft;

    // Only first and last buttons inherit container rounding
    const roundedClass =
      idx === 0
        ? "rounded-l-full"
        : idx === 2
        ? "rounded-r-full"
        : ""; // middle button: no rounding

    return (
      <button
        key={ft}
        className={`flex-1 text-center font-medium text-sm transition-colors duration-150
          ${isSelected ? "bg-blue-500 text-white" : "text-gray-700 hover:text-gray-900"} 
          ${roundedClass} cursor-pointer`}
        onClick={() => setTypeFilter(ft)}
      >
        {ft === "ALL" ? "All" : ft === "BUYER" ? "Buyers" : "Suppliers"}
      </button>
    );
  })}
</div>


          {/* Action Buttons */}
          <div className="flex gap-2 items-center">
            <Tooltip content="Refresh">
              <button
                onClick={() => fetchList(page)}
                disabled={loading}
                className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
              >
                <i className="bx bx-refresh text-lg" />
              </button>
            </Tooltip>
            {selectedIds.size > 0 && (
              <>
                <Tooltip content="Bulk Edit Type">
                  <button
                    onClick={() => setBulkEditOpen(true)}
                    className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
                  >
                    <i className="bx bx-edit-alt text-lg" />
                  </button>
                </Tooltip>
                <Tooltip content="Delete Selected">
                  <button
                    onClick={() => setBulkDeleteOpen(true)}
                    className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
                  >
                    <i className="bx bx-trash text-red-600 text-lg" />
                  </button>
                </Tooltip>
              </>
            )}
            <Tooltip content="Add Customer">
              <button
                onClick={openCreate}
                className="px-2 py-2 flex bg-gray-100 rounded-full hover:bg-gray-200 transition transform hover:scale-105"
              >
                <i className="bx bx-plus text-lg" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Search Box */}
        <div>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchList(1)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

{/* ---------------- TABLE ---------------- */}
<div className="flex-1 overflow-x-auto rounded-md border border-gray-200 shadow-sm">
  <table className="w-full text-sm table-auto">
    {/* Table Header */}
    <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
      <tr>
        <th className="p-3">
          <input
            type="checkbox"
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            checked={selectedIds.size === customers.length && customers.length > 0}
            onChange={toggleSelectAll}
          />
        </th>
        <th className="p-3 text-left">Name</th>
        <th className="p-3 text-left">Type</th>
        <th className="p-3 text-left">Contact</th>
        <th className="p-3 text-left">Joined</th>
      </tr>
    </thead>

    {/* Table Body */}
    <tbody className="divide-y divide-gray-100">
      {loading
        ? Array.from({ length: 10 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={5} className="p-4">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
              </td>
            </tr>
          ))
        : paginated.map((c) => (
            <tr
              key={c.id}
              className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
              onClick={() => router.push(`/dashboard/customers/${c.id}`)}
            >
              <td className="p-3">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={selectedIds.has(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(c.id)}
                />
              </td>
              <td className="p-3 font-medium">{c.name}</td>
              <td className="p-3 capitalize">{c.type.toLowerCase()}</td>
              <td className="p-3 text-xs text-gray-600">
                {c.email ?? "-"} <br />
                {c.phone ?? "-"}
              </td>
              <td className="p-3 text-xs text-gray-500">
                {new Date(c.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}

      {/* Empty State */}
      {!loading && paginated.length === 0 && (
        <tr>
          <td colSpan={5} className="p-6 text-center text-gray-400">
            No customers found.
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>

      {/* ---------------- PAGINATION ---------------- */}
      <div className="flex justify-between text-xs mt-2">
        <div>Total: {total}</div>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 bg-gray-50 rounded-md">
            Prev
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 bg-gray-50 rounded-md">
            Next
          </button>
        </div>
      </div>

      {/* ---------------- CONFIRM MODALS ---------------- */}
      {confirmDelete.open && confirmDelete.id && (
        <ConfirmModal
          open={confirmDelete.open}
          title="Delete Customer"
          message="Are you sure you want to delete this customer?"
          destructive
          loading={loading}
          onClose={() => setConfirmDelete({ open: false, id: null })}
          onConfirm={async () => await handleDelete(confirmDelete.id!)}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmModal
          open={bulkDeleteOpen}
          title="Delete Selected Customers"
          message={`Are you sure you want to delete ${selectedIds.size} selected customers?`}
          destructive
          loading={loading}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={async () => {
            await handleBulkDelete();
            setBulkDeleteOpen(false);
          }}
        />
      )}

      {bulkEditOpen && (
        <ConfirmModal
          open={bulkEditOpen}
          title="Bulk Edit Type"
          message={`Update type of ${selectedIds.size} selected customers to ${bulkType}?`}
          confirmLabel="Update"
          loading={loading}
          onClose={() => setBulkEditOpen(false)}
          onConfirm={async () => {
            await handleBulkEditType();
          }}
        />
      )}
    </div>
  );
}
