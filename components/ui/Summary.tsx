"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Tooltip } from "@/components/feedback/Tooltip";
import ConfirmModal from "@/components/modal/ConfirmModal";

/* ---------------- Summary Card ---------------- */
export type SummaryCard = {
  id: string;
  title: string;
  value: number;
  filter?: "D" | "W" | "M" | "Y";
  color?: string;
  isCurrency?: boolean;
};

interface SummaryProps {
  cardsData: SummaryCard[];
  loading?: boolean;
  /** Called whenever time filter changes. Returns date range */
  onTimeFilterChange?: (range: { start: Date; end: Date; timeFilter: "D" | "W" | "M" | "Y" }) => void;
}

/* ---------------- Layout types ---------------- */
type MaxColumns = 3 | 4 | 5;
type MaxRows = 1 | 2;

const STORAGE = {
  visible: "summary.visibleCards",
  columns: "summary.maxColumns",
  rows: "summary.maxRows",
  showTimeFilter: "summary.showTimeFilter",
  timeFilter: "summary.timeFilter",
  order: "summary.cardOrder",
};

/* ---------------- Utility: Get date range ---------------- */
export function getDateRange(timeFilter: "D" | "W" | "M" | "Y") {
  const now = new Date();
  let start: Date;
  let end: Date = new Date();

  switch (timeFilter) {
    case "D":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    case "W": {
      const day = now.getDay(); // 0=Sunday
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "M":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case "Y":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
  }

  return { start, end, timeFilter };
}

/* ---------------- Summary Component ---------------- */
export default function Summary({ cardsData, loading = false, onTimeFilterChange }: SummaryProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);

  const [cards, setCards] = useState<SummaryCard[]>(cardsData);

  /* ---------------- Persisted states ---------------- */
  const [visibleCardIds, setVisibleCardIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return cardsData.slice(0, 3).map(c => c.id);
    const stored = localStorage.getItem(STORAGE.visible);
    if (!stored) return cardsData.slice(0, 3).map(c => c.id);
    const parsed: string[] = JSON.parse(stored);
    const filtered = parsed.filter(id => cardsData.some(c => c.id === id));
    while (filtered.length < 3) {
      const next = cardsData.find(c => !filtered.includes(c.id));
      if (!next) break;
      filtered.push(next.id);
    }
    return filtered;
  });

  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return cardsData.map(c => c.id);
    const stored = localStorage.getItem(STORAGE.order);
    if (!stored) return cardsData.map(c => c.id);
    try {
      const parsed: string[] = JSON.parse(stored);
      const valid = parsed.filter(id => cardsData.some(c => c.id === id));
      return valid.length ? valid : cardsData.map(c => c.id);
    } catch {
      return cardsData.map(c => c.id);
    }
  });

  const [maxColumns, setMaxColumns] = useState<MaxColumns>(() => {
    if (typeof window === "undefined") return 3;
    const stored = localStorage.getItem(STORAGE.columns);
    return stored === "4" || stored === "5" ? Number(stored) as MaxColumns : 3;
  });

  const [maxRows, setMaxRows] = useState<MaxRows>(() => {
    if (typeof window === "undefined") return 1;
    return localStorage.getItem(STORAGE.rows) === "2" ? 2 : 1;
  });

  const [showTimeFilter, setShowTimeFilter] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(STORAGE.showTimeFilter);
    return stored === null ? true : stored === "true";
  });

  const [timeFilter, setTimeFilter] = useState<"D" | "W" | "M" | "Y">(() => {
    if (typeof window === "undefined") return "D";
    const stored = localStorage.getItem(STORAGE.timeFilter);
    return ["D","W","M","Y"].includes(stored || "") ? (stored as "D"|"W"|"M"|"Y") : "D";
  });

  /* ---------------- Defaults ---------------- */
  const DEFAULTS = {
    visibleCardIds: cardsData.slice(0, 3).map(c => c.id),
    maxColumns: 3 as MaxColumns,
    maxRows: 1 as MaxRows,
    showTimeFilter: true,
    timeFilter: "D" as "D" | "W" | "M" | "Y",
    cardOrder: cardsData.map(c => c.id),
  };

  /* ---------------- Persist states ---------------- */
  useEffect(() => { localStorage.setItem(STORAGE.visible, JSON.stringify(visibleCardIds)); }, [visibleCardIds]);
  useEffect(() => { localStorage.setItem(STORAGE.columns, String(maxColumns)); }, [maxColumns]);
  useEffect(() => { localStorage.setItem(STORAGE.rows, String(maxRows)); }, [maxRows]);
  useEffect(() => { localStorage.setItem(STORAGE.showTimeFilter, String(showTimeFilter)); }, [showTimeFilter]);
  useEffect(() => { localStorage.setItem(STORAGE.timeFilter, timeFilter); }, [timeFilter]);
  useEffect(() => { localStorage.setItem(STORAGE.order, JSON.stringify(cardOrder)); }, [cardOrder]);

  /* ---------------- Sync cardsData ---------------- */
  useEffect(() => {
    setCards(cardsData);

    setVisibleCardIds(prev => {
      const valid = prev.filter(id => cardsData.some(c => c.id === id));
      return valid.length ? valid : cardsData.slice(0, 3).map(c => c.id);
    });

    setCardOrder(prev => {
      const valid = prev.filter(id => cardsData.some(c => c.id === id));
      return valid.length ? valid : cardsData.map(c => c.id);
    });
  }, [cardsData]);

  /* ---------------- Derived ---------------- */
  const visibleCards = useMemo(() => {
    const ordered = cardOrder
      .map(id => cards.find(c => c.id === id))
      .filter((c): c is SummaryCard => !!c);

    return ordered.filter(c => visibleCardIds.includes(c.id));
  }, [cards, visibleCardIds, cardOrder]);

  const maxDisplayCount = maxColumns * maxRows;
  const displayCards = useMemo(() => visibleCards.slice(0, maxDisplayCount), [visibleCards, maxDisplayCount]);

  /* ---------------- Notify parent on time filter change ---------------- */
  useEffect(() => {
    if (onTimeFilterChange) onTimeFilterChange(getDateRange(timeFilter));
  }, [timeFilter, onTimeFilterChange]);

  /* ---------------- Drag & Drop ---------------- */
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(cardOrder);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setCardOrder(reordered);
    setHasUnsavedChanges(true);
  };

  /* ---------------- Card Visibility ---------------- */
  const toggleVisibleCard = (id: string) => {
    setVisibleCardIds(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
    setHasUnsavedChanges(true);
  };
  const selectAllCards = () => { setVisibleCardIds(cards.map(c => c.id)); setHasUnsavedChanges(true); };
  const deselectAllCards = () => { setVisibleCardIds([]); setHasUnsavedChanges(true); };
  const allSelected = visibleCardIds.length === cards.length;

  /* ---------------- Confirm Modal ---------------- */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const onConfirmDiscard = () => { setHasUnsavedChanges(false); setConfirmOpen(false); setShowCardModal(false); };
  const onCancelDiscard = () => setConfirmOpen(false);

  function handleClickOutside(e: MouseEvent) {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      if (hasUnsavedChanges) setConfirmOpen(true);
      else setShowCardModal(false);
    }
  }

  useEffect(() => {
    if (showCardModal) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCardModal, hasUnsavedChanges]);

  /* ---------------- Reset defaults ---------------- */
  const resetDefaults = () => {
    setVisibleCardIds(DEFAULTS.visibleCardIds);
    setMaxColumns(DEFAULTS.maxColumns);
    setMaxRows(DEFAULTS.maxRows);
    setShowTimeFilter(DEFAULTS.showTimeFilter);
    setTimeFilter(DEFAULTS.timeFilter);
    setCardOrder(DEFAULTS.cardOrder);
    setHasUnsavedChanges(true);
  };

  /* ---------------- Skeletons ---------------- */
  const renderSkeletons = () =>
    Array.from({ length: Math.max(3, maxDisplayCount) }).map((_, i) => (
      <div key={i} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
        <div className="h-6 bg-slate-300 rounded w-1/2" />
      </div>
    ));

  /* ---------------- Render ---------------- */
  return (
    <>
      <ConfirmModal
        open={confirmOpen}
        title="Unsaved Changes"
        message="You have unsaved layout changes. Save or discard?"
        onConfirm={onConfirmDiscard}
        onClose={onCancelDiscard}
      />

      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold">Summary</span>

          <div className="flex gap-2 items-center">
            {showTimeFilter &&
              (["D","W","M","Y"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTimeFilter(f)}
                  className={`w-10 h-10 rounded-lg font-bold transition ${
                    timeFilter === f ? "bg-black text-white" : "bg-white text-black border border-slate-300"
                  }`}
                >
                  {f}
                </button>
              ))
            }

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                  <i className="bx bx-dots-vertical-rounded text-lg" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 shadow-md"
              >
                <DropdownMenu.Item
                  onSelect={() => setIsReorderMode(true)}
                  className="px-4 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-gray-100"
                >
                  <i className="bx bx-move" /> Reorder
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onSelect={() => setShowCardModal(true)}
                  className="px-4 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-gray-100"
                >
                  <i className="bx bx-layout" /> Edit Layout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Cards */}
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="summary" direction="horizontal">
            {provided => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${Math.min(maxColumns, displayCards.length || maxColumns)}, minmax(0, 1fr))` }}
              >
                {loading
                  ? renderSkeletons()
                  : displayCards.map((card, index) => (
                    <Draggable key={card.id} draggableId={card.id} index={index} isDragDisabled={!isReorderMode}>
                      {provided => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`relative p-4 bg-white rounded-xl border border-slate-200 shadow-sm transition hover:bg-gray-50 ${isReorderMode ? "ring-1 ring-blue-200" : ""}`}
                        >
                          {isReorderMode && <div {...provided.dragHandleProps} className="absolute top-3 right-3 text-gray-400 cursor-grab"><i className="bx bx-move" /></div>}
                          <div>
                            <div className="text-sm text-slate-500">{card.title}</div>
                            <div className={`text-xl font-bold mt-1 ${card.color ?? "text-slate-900"}`}>
                              {card.value}
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))
                }
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>



        {/* Modal */}
        {showCardModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center px-4 py-6">
            <div
              ref={modalRef}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-[30rem] max-h-[80vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center px-5 py-3 border-b">
                <h3 className="font-semibold text-lg">Summary Settings</h3>
                <button onClick={() => setShowCardModal(false)}>
                  <i className="bx bx-x text-xl" />
                </button>
              </div>

              <div className="px-5 py-4 flex-1 overflow-y-auto space-y-6">
                {/* Rows */}
                <div>
                  <p className="text-sm font-medium mb-1">Rows</p>
                  <div className="flex gap-2">
                    {[1, 2].map(r => (
                      <button
                        key={r}
                        onClick={() => { setMaxRows(r as MaxRows); setHasUnsavedChanges(true); }}
                        className={`px-3 py-1 rounded-lg ${maxRows === r ? "bg-blue-500 text-white" : "bg-gray-100"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Columns */}
                <div>
                  <p className="text-sm font-medium mb-1">Max Columns</p>
                  <div className="flex gap-2">
                    {[3, 4, 5].map(c => (
                      <button
                        key={c}
                        onClick={() => { setMaxColumns(c as MaxColumns); setHasUnsavedChanges(true); }}
                        className={`px-3 py-1 rounded-lg ${maxColumns === c ? "bg-blue-500 text-white" : "bg-gray-100"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Filter */}
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">Show Time Filter</p>
                  <button
                    onClick={() => { setShowTimeFilter(!showTimeFilter); setHasUnsavedChanges(true); }}
                    className={`w-12 h-6 rounded-full p-1 transition ${showTimeFilter ? "bg-blue-500" : "bg-gray-200"}`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${showTimeFilter ? "translate-x-6" : "translate-x-0"}`} />
                  </button>
                </div>

                {/* Cards with tooltip icons */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Cards</span>
                    <div className="flex gap-2">
                      <Tooltip content={allSelected ? "Deselect All" : "Select All"}>
                        <button
                          onClick={() => (allSelected ? deselectAllCards() : selectAllCards())}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
                          aria-label={allSelected ? "Deselect All Cards" : "Select All Cards"}
                        >
                          <i className={`bx ${allSelected ? "bx-minus" : "bx-check"} text-lg`} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Reset to defaults">
                        <button
                          onClick={resetDefaults}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
                          aria-label="Reset Cards to Defaults"
                        >
                          <i className="bx bx-reset text-lg" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {cards.map(card => {
                      const checked = visibleCardIds.includes(card.id);
                      return (
                        <div
                          key={card.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition ${
                            checked ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200"
                          } hover:bg-gray-50`}
                        >
                          <span className="text-sm font-medium">{card.title}</span>
                          <Tooltip content={checked ? "Hide Card" : "Show Card"}>
                            <button
                              onClick={() => toggleVisibleCard(card.id)}
                              className={`w-6 h-6 flex items-center justify-center rounded border transition ${
                                checked ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-slate-300"
                              }`}
                              aria-label={checked ? `Hide ${card.title}` : `Show ${card.title}`}
                            >
                              <i className={`bx ${checked ? "bx-check" : "bx-plus"} text-sm`} />
                            </button>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end px-5 py-3 border-t">
                <button
                  onClick={() => setShowCardModal(false)}
                  className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
