"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import Summary, { SummaryCard } from "@/components/ui/Summary";
import DataTableToolbar from "@/components/ui/DataTableToolbar";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";

import type { ProductsResponse, InventoryProduct } from "@/types";

/* ================= ALL TAGS (STATIC) ================= */
const ALL_TAGS: InventoryProduct["tag"][] = [
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "HOT",
  "DISCONTINUED",
];

/* ================= Fetcher ================= */
const fetcher = async (url: string): Promise<ProductsResponse> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
};

/* ================= Sort Type ================= */
const SORT_VALUES = ["", "az", "newest"] as const;
type SortOrder = (typeof SORT_VALUES)[number];

export default function InventoryPage() {
  const pathname = usePathname();

  /* ---------------- State ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Multi-select tag filter state
  const [tagFilterArray, setTagFilterArray] = useState<InventoryProduct["tag"][]>([]);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- Reset Page ---------------- */
  useEffect(() => setPage(1), [debouncedSearch, sortOrder, tagFilterArray]);

  /* ---------------- Data Fetch ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortOrder) params.set("sort", sortOrder);
    return params.toString();
  }, [page, debouncedSearch, sortOrder]);

  const { data, isLoading, mutate } = useSWR<ProductsResponse>(
    `/api/dashboard/products?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* ---------------- Computed Metrics & Tags ---------------- */
  const computed = useMemo(() => {
    let totalQuantity = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let hotCount = 0;
    let discontinuedCount = 0;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const enrichedProducts = products.map((p) => {
      const stock = p.stock ?? 0;
      const reorderLevel = p.reorderLevel ?? Infinity;
      const lastRestocked = p.lastRestockedAt ? new Date(p.lastRestockedAt) : null;

      totalQuantity += stock;
      totalValue += stock * (p.sellingPrice ?? 0);

      let tag: InventoryProduct["tag"];
      if (!lastRestocked || lastRestocked < oneYearAgo) {
        tag = "DISCONTINUED";
        discontinuedCount++;
      } else if (stock <= 0) {
        tag = "OUT_OF_STOCK";
        outOfStockCount++;
      } else if (stock <= reorderLevel) {
        tag = "LOW_STOCK";
        lowStockCount++;
      } else if (stock > reorderLevel * 2) {
        tag = "HOT";
        hotCount++;
      } else {
        tag = undefined as unknown as InventoryProduct["tag"];
      }

      return { ...p, tag };
    });

    const filters = ALL_TAGS.map((tag) => ({
      label: tag.replace("_", " "),
      value: tag,
    }));

    return {
      totalQuantity,
      totalValue,
      lowStockCount,
      outOfStockCount,
      hotCount,
      discontinuedCount,
      enrichedProducts,
      filters,
    };
  }, [products]);

  /* ---------------- Frontend Tag Filtering (multi-select) ---------------- */
  const filteredProducts = useMemo(() => {
    if (!tagFilterArray.length) return computed.enrichedProducts;
    return computed.enrichedProducts.filter((p) =>
      tagFilterArray.includes(p.tag)
    );
  }, [computed.enrichedProducts, tagFilterArray]);

  /* ---------------- CSV Export ---------------- */
  const exportData = useMemo(
    () =>
      filteredProducts.map((p) => ({
        Name: p.name,
        SKU: p.sku,
        Category: p.category?.name ?? "",
        Price: p.sellingPrice ? `₦${p.sellingPrice.toLocaleString()}` : "₦0",
        Stock: p.stock,
        Supplier: p.vendor?.name ?? "",
        Tag: p.tag,
        "Last Restocked": p.lastRestockedAt ?? "",
      })),
    [filteredProducts]
  );

  /* ---------------- Summary Cards ---------------- */
  const summaryCards: SummaryCard[] = useMemo(
    () => [
      { id: "totalQuantity", title: "Total Quantity", value: computed.totalQuantity },
      {
        id: "totalValue",
        title: "Total Value",
        value: computed.totalValue ? `₦${computed.totalValue.toLocaleString()}` : "₦0",
      },
      { id: "lowStock", title: "Low Stock", value: computed.lowStockCount },
      { id: "outOfStock", title: "Out of Stock", value: computed.outOfStockCount },
      { id: "hot", title: "Hot Products", value: computed.hotCount },
      { id: "discontinued", title: "Discontinued", value: computed.discontinuedCount },
      { id: "pendingOrders", title: "Pending Orders", value: data?.pendingOrders ?? 0 },
    ],
    [computed, data]
  );

  /* ---------------- Refresh ---------------- */
  const handleRefresh = async () => {
    setRefreshing(true);
    await mutate();
    setRefreshing(false);
  };

  /* ---------------- Sort Options ---------------- */
  const sortOptions = useMemo(
    () => [
      { value: "newest" as SortOrder, label: "Newest" },
      { value: "az" as SortOrder, label: "Name (A → Z)" },
    ],
    []
  );

  /* ---------------- Columns (Price is now Green) ---------------- */
  const columns: DataTableColumn<InventoryProduct>[] = useMemo(
    () => [
      { key: "name", header: "Product", render: (p) => p.name, align: "left" },
      { key: "sku", header: "SKU", render: (p) => p.sku, hideTooltip: true },
      { key: "category", header: "Category", render: (p) => p.category?.name ?? "-" },
      {
        key: "sellingPrice",
        header: "Price",
        hideTooltip: true,
        render: (p) => (
          <span className="font-medium text-green-600">
            ₦{(p.sellingPrice ?? 0).toLocaleString()}
          </span>
        ),
      },
      {
        key: "stock",
        header: "Stock",
        hideTooltip: true,
        render: (p) => {
          const reorderLevel = p.reorderLevel ?? Infinity;
          const stockClass =
            p.stock === 0
              ? "text-red-700"
              : p.stock <= reorderLevel
              ? "text-yellow-700"
              : "";
          return <span className={stockClass}>{p.stock}</span>;
        },
      },
      { key: "vendor", header: "Supplier", render: (p) => p.vendor?.name ?? "-" },
    ],
    []
  );

  const resolveRowId = useCallback(
    (row: InventoryProduct, index: number) => row.branchProductId ?? `row-${index}`,
    []
  );

  const tableId = useMemo(() => pathname ? pathname.replace(/^\//, "").replace(/\//g, "-") : "table", [pathname]);

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      <Summary cardsData={summaryCards} loading={isLoading} />

      <DataTableToolbar<InventoryProduct, SortOrder, InventoryProduct["tag"]>
        search={search}
        onSearchChange={setSearch}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onAdd={() => window.open("/dashboard/inventory/add", "_blank")}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortOptions={sortOptions}
        exportData={exportData}
        exportFileName="inventory.csv"
        filters={[
          {
            label: "Tag",
            value: tagFilterArray,
            defaultValue: [] as InventoryProduct["tag"][],
            options: computed.filters,
            onChange: setTagFilterArray,
          },
        ]}
      />

      <DataTable<InventoryProduct>
        tableId={tableId}
        data={filteredProducts}
        columns={columns}
        getRowId={resolveRowId}
        loading={isLoading}
        onRowClick={(p) => `/dashboard/inventory/${p.branchProductId}`}
        dateField="lastRestockedAt"
      />


    </div>
  );
}