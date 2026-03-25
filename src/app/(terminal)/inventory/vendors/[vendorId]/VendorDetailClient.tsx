"use client";

import React, { useState, useMemo } from "react";
import type { BranchProduct } from "@/src/types";
import DataTable, { DataTableColumn } from "@/src/core/components/ui/DataTable";
import { Tooltip } from "@/src/core/components/feedback/Tooltip";
import { useSession } from "next-auth/react";

/** Inline Summary Component */
function SummaryPanel({ cards }: { cards: { id: string; title: string; value: number | string }[] }) {
  return (
    <div className="bg-white p-4 rounded shadow space-y-4 w-full lg:w-80">
      {cards.map((card) => (
        <div key={card.id} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-b-0">
          <p className="text-gray-500 font-medium">{card.title}</p>
          <p className="text-lg font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Simple Toolbar Component */
interface SimpleToolbarProps {
  search: string;
  onSearchChange: (val: string) => void;
  sortOrder: "NameAsc" | "NameDesc";
  onSortChange: (val: "NameAsc" | "NameDesc") => void;
  onRefresh: () => void;
}

function SimpleToolbar({ search, onSearchChange, sortOrder, onSortChange, onRefresh }: SimpleToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded shadow mb-4 gap-2">
      <input
        type="text"
        placeholder="Search products..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="border rounded px-3 py-1 flex-1"
      />
      <div className="flex items-center gap-2">
        <select
          value={sortOrder}
          onChange={(e) => onSortChange(e.target.value as "NameAsc" | "NameDesc")}
          className="border rounded px-2 py-1"
        >
          <option value="NameAsc">Name Asc</option>
          <option value="NameDesc">Name Desc</option>
        </select>
        <button onClick={onRefresh} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
          Refresh
        </button>
      </div>
    </div>
  );
}

/** Define a VendorDetail type inline to fix missing import */
export interface VendorDetail {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  createdAt: string;
  updatedAt: string;
  branchProducts: BranchProduct[];
}

interface VendorDetailClientProps {
  vendor: VendorDetail;
}

export default function VendorDetailClient({ vendor }: VendorDetailClientProps) {
  const { data: session } = useSession();
  const branchId = session?.user?.branchId;

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"NameAsc" | "NameDesc">("NameAsc");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    if (!branchId) return [];
    return vendor.branchProducts
      .filter((bp: BranchProduct) => (bp.branch?.id ?? bp.branchId)?.toString() === branchId.toString())
      .filter(
        (bp: BranchProduct) =>
          (bp.product?.name ?? "")?.toLowerCase().includes(search.toLowerCase()) ||
          (bp.branch?.name ?? "")?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a: BranchProduct, b: BranchProduct) =>
        sortOrder === "NameAsc"
          ? (a.product?.name ?? "").localeCompare(b.product?.name ?? "")
          : (b.product?.name ?? "").localeCompare(a.product?.name ?? "")
      );
  }, [vendor.branchProducts, branchId, search, sortOrder]);

  const columns: DataTableColumn<BranchProduct>[] = useMemo(
    () => [
      { key: "product", header: "Product", render: (row) => row.product?.name ?? "N/A" },
      { key: "stock", header: "Stock", render: (row) => row.stock, align: "right" },
      { key: "unit", header: "Unit", render: (row) => row.unit ?? "pcs", align: "center" },
      { key: "reorderLevel", header: "Reorder Level", render: (row) => row.reorderLevel, align: "right" },
      { key: "sellingPrice", header: "Selling Price", render: (row) => row.sellingPrice ?? "N/A", align: "right" },
    ],
    []
  );

  const summaryCards = useMemo(() => {
    const totalStock = filteredProducts.reduce((acc, bp) => acc + bp.stock, 0);
    const totalProducts = filteredProducts.length;
    const belowReorder = filteredProducts.filter((bp) => bp.stock <= bp.reorderLevel).length;
    return [
      { id: "totalStock", title: "Total Stock", value: totalStock },
      { id: "totalProducts", title: "Products Supplied", value: totalProducts },
      { id: "belowReorder", title: "Below Reorder Level", value: belowReorder },
    ];
  }, [filteredProducts]);

  return (
    <div className="p-6 space-y-6 min-h-[calc(100vh-4rem)]">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 bg-white p-4 rounded shadow space-y-2">
          <h1 className="text-3xl font-bold">{vendor.name}</h1>
          <p>
            <strong>Email:</strong> {vendor.email ?? "N/A"}
          </p>
          <p>
            <strong>Phone:</strong> {vendor.phone ?? "N/A"}
          </p>
          <p>
            <strong>Address:</strong> {vendor.address ?? "N/A"}
          </p>
          <p>
            <strong>Created:</strong> {new Date(vendor.createdAt).toLocaleString()}
          </p>
          <p>
            <strong>Updated:</strong> {new Date(vendor.updatedAt).toLocaleString()}
          </p>
        </div>
        <SummaryPanel cards={summaryCards} />
      </div>

      <SimpleToolbar
        search={search}
        onSearchChange={setSearch}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        onRefresh={() => console.log("Refresh clicked")}
      />

      <DataTable
        data={filteredProducts}
        columns={columns}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelectedProductId(row.id)}
        emptyMessage="No products for this branch."
      />

      {selectedProductId && (
        <div className="flex justify-end mt-4">
          <Tooltip
            content={
              <div className="flex flex-col space-y-1">
                <button onClick={() => alert(`Edit ${selectedProductId}`)} className="hover:underline text-left">
                  Edit
                </button>
                <button onClick={() => alert(`Restock ${selectedProductId}`)} className="hover:underline text-left">
                  Restock
                </button>
                <button
                  onClick={() => alert(`Delete ${selectedProductId}`)}
                  className="hover:underline text-left text-red-600"
                >
                  Delete
                </button>
              </div>
            }
            side="top"
          >
            <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">More Actions</button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}