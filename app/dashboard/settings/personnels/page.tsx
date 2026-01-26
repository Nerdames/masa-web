"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useDebounce } from "@/app/hooks/useDebounce";
import { useToast } from "@/components/feedback/ToastProvider";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Tooltip } from "@/components/feedback/Tooltip";
import AccessDenied from "@/components/feedback/AccessDenied";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import type {
  AuthorizedPersonnel,
  BranchAssignment,
  Role,
} from "@prisma/client";

/* ---------------- TYPES ---------------- */
type PersonnelWithRoles = AuthorizedPersonnel & {
  branchAssignments: Pick<BranchAssignment, "role">[];
};

interface PersonnelResponse {
  data: PersonnelWithRoles[];
  total: number;
  page: number;
  pageSize: number;
  activeCount: number;
}

/* ---------------- FETCHER ---------------- */
const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(res => {
    if (!res.ok) throw new Error("Unauthorized");
    return res.json();
  });

/* ---------------- SKELETON ---------------- */
const SkeletonRow = () => (
  <tr className="animate-pulse h-16">
    {Array.from({ length: 6 }).map((_, i) => (
      <td key={i} className="p-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
      </td>
    ))}
  </tr>
);

/* ---------------- PAGE ---------------- */
export default function PersonnelPage() {
  const { data: session, status } = useSession();
  const toast = useToast();
  const router = useRouter();

  /* ---------------- AUTH ---------------- */
  if (status === "loading") return null;

  const isAuthorized =
    session?.user?.role === "DEV" ||
    (session?.user?.role === "ADMIN" && session?.user?.isOrgOwner);

  if (!isAuthorized) return <AccessDenied />;

  /* ---------------- STATE ---------------- */
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  const debouncedSearch = useDebounce(search, 400);

  /* ---------------- QUERY ---------------- */
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  }, [page, debouncedSearch]);

  /* ---------------- SWR ---------------- */
  const { data, isLoading, mutate } = useSWR<PersonnelResponse>(
    `/api/dashboard/personnel?${query}`,
    fetcher,
    { keepPreviousData: true }
  );

  const personnel = data?.data ?? [];
  const total = data?.total ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const inactiveCount = total - activeCount;
  const pageCount = Math.max(1, Math.ceil(total / 10));

  /* ---------------- HELPERS ---------------- */
  const isActive = (p: PersonnelWithRoles) => !p.disabled && !p.deletedAt;

  const resolveRole = (p: PersonnelWithRoles): Role | "—" => {
    if (p.branchAssignments.some(b => b.role === "DEV")) return "DEV";
    if (p.id === session?.user?.id && session?.user?.isOrgOwner) return "ADMIN";
    return p.branchAssignments[0]?.role ?? "—";
  };

  /* ---------------- SELECTION ---------------- */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === personnel.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(personnel.map(p => p.id)));
    }
  };

  const isAllSelected = personnel.length > 0 && personnel.every(p => selectedIds.has(p.id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  /* ---------------- BULK DELETE ---------------- */
  const bulkDelete = async () => {
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          fetch(`/api/dashboard/personnel/${id}`, {
            method: "DELETE",
          })
        )
      );
      toast.addToast({ type: "success", message: "Personnel deleted" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      mutate();
    } catch {
      toast.addToast({ type: "error", message: "Bulk delete failed" });
    }
  };

  /* ---------------- SUMMARY CARDS ---------------- */
  const initialCards = [
    { id: "total", label: "Total Personnel", value: total },
    { id: "active", label: "Active", value: activeCount },
    { id: "inactive", label: "Inactive", value: inactiveCount },
  ];
  const [cards, setCards] = useState(initialCards);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(cards);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setCards(reordered);
  };

  return (
    <div className="flex flex-col space-y-4 min-h-[calc(100vh-4rem)] p-4">
      {/* ================= SHOW/HIDE SUMMARY ================= */}
      <button
        className="self-start text-xs text-blue-600 hover:underline"
        onClick={() => setShowSummary(prev => !prev)}
      >
        {showSummary ? "Hide Summary" : "Show Summary"}
      </button>

      {showSummary && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="summary-cards" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {cards.map((card, index) => (
                  <Draggable key={card.id} draggableId={card.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="p-4 bg-white rounded shadow cursor-move hover:bg-gray-50"
                        onClick={() => {
                          if (card.id === "active") {
                            setPage(1);
                            // Example: filter active personnel
                          }
                          if (card.id === "inactive") {
                            setPage(1);
                            // Example: filter inactive personnel
                          }
                        }}
                      >
                        <span className="text-gray-500 text-sm">{card.label}</span>
                        <span className="text-2xl font-bold">{card.value}</span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* ================= TOP BAR ================= */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded shadow">
        <input
          type="text"
          placeholder="Search personnel..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[280px]"
        />

        <Tooltip content="Refresh">
          <button
            onClick={() => mutate()}
            className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200"
          >
            <i className="bx bx-refresh text-lg" />
          </button>
        </Tooltip>

        {selectedIds.size > 0 && (
          <Tooltip content="Delete Selected">
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200"
            >
              <i className="bx bx-trash text-red-600 text-lg" />
            </button>
          </Tooltip>
        )}

        <div className="ml-auto">
          <Tooltip content="Add Personnel">
            <button
              onClick={() => router.push("/dashboard/personnel/add")}
              className="flex px-3 py-3 bg-gray-100 rounded-full hover:bg-gray-200"
            >
              <i className="bx bx-plus text-blue-600 text-lg" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="flex-1 overflow-x-auto rounded-md border shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : personnel.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </td>
                    <td className="p-3 font-medium">{p.name ?? "—"}</td>
                    <td className="p-3">{p.email}</td>
                    <td className="p-3">{resolveRole(p)}</td>
                    <td className="p-3">
                      <span className={isActive(p) ? "text-green-600" : "text-gray-500"}>
                        {isActive(p) ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => router.push(`/dashboard/personnel/edit/${p.id}`)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINATION ================= */}
      <div className="flex justify-between text-xs">
        <span>Total: {total}</span>
        <div className="flex gap-2 items-center">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {pageCount}</span>
          <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* ================= CONFIRM ================= */}
      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title="Delete Personnel"
          message={`Delete ${selectedIds.size} selected personnel?`}
          destructive
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={bulkDelete}
        />
      )}
    </div>
  );
}
