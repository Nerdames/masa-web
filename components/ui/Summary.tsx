"use client";

import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

export type SummaryCard = {
  id: string;
  title: string;
  value: number;
  filter: string;
  color?: string;
};

interface SummaryProps {
  cardsData: SummaryCard[];
}

export default function Summary({ cardsData }: SummaryProps) {
  const [showSummary, setShowSummary] = useState(true);
  const [showCardModal, setShowCardModal] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);

  // Cards state
  const [cards, setCards] = useState<SummaryCard[]>(cardsData);

  // ======================= Visible Cards =======================
  const [visibleCardIds, setVisibleCardIds] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return cardsData.slice(0, 3).map(c => c.id);
    }
    const saved = localStorage.getItem("visibleCards");
    if (saved) {
      const parsed: string[] = JSON.parse(saved);
      const valid = parsed.filter(id => cardsData.some(c => c.id === id));
      while (valid.length < 3) {
        const next = cardsData.find(c => !valid.includes(c.id));
        if (!next) break;
        valid.push(next.id);
      }
      return valid;
    }
    return cardsData.slice(0, 3).map(c => c.id);
  });

  // ======================= Sync cardsData =======================
  useEffect(() => {
    setCards(cardsData);
    setVisibleCardIds(prev => {
      const validPrev = prev.filter(id => cardsData.some(c => c.id === id));
      const additional = cardsData
        .map(c => c.id)
        .filter(id => !validPrev.includes(id))
        .slice(0, Math.max(0, 3 - validPrev.length));
      return [...validPrev, ...additional];
    });
  }, [cardsData]);

  // ======================= Persist visible cards =======================
  useEffect(() => {
    localStorage.setItem("visibleCards", JSON.stringify(visibleCardIds));
  }, [visibleCardIds]);

  // ======================= Drag & Drop Handler =======================
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(cards);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setCards(reordered);
  };

  // ======================= Toggle Visible Cards =======================
  const toggleVisibleCard = (id: string) => {
    setVisibleCardIds(prev => {
      if (prev.includes(id)) return prev.filter(v => v !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-4">
      {/* ================= Header ================= */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowSummary(p => !p)}
          className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
          title={showSummary ? "Hide Summary" : "Show Summary"}
        >
          <i className={showSummary ? "bx bx-hide text-lg" : "bx bx-show text-lg"} />
        </button>

        {showSummary && (
          <div className="flex items-center gap-2">
            {isReorderMode && (
              <button
                onClick={() => setIsReorderMode(false)}
                className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition"
                title="Done"
              >
                <i className="bx bx-check text-blue-600 text-xl" />
              </button>
            )}

            {/* Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                  <i className="bx bx-dots-vertical-rounded text-lg" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 shadow-md"
                >
                  <DropdownMenu.Item
                    onSelect={() => setIsReorderMode(true)}
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 flex items-center gap-2 outline-none"
                  >
                    <i className="bx bx-move" />
                    Reorder
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onSelect={() => setShowCardModal(true)}
                    className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 flex items-center gap-2 outline-none"
                  >
                    <i className="bx bx-layout" />
                    Cards
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )}
      </div>

      {/* ================= Cards ================= */}
      {showSummary && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="summary" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                {cards
                  .filter(card => visibleCardIds.includes(card.id))
                  .map((card, index) => (
                    <Draggable
                      key={card.id}
                      draggableId={card.id}
                      index={index}
                      isDragDisabled={!isReorderMode}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`relative p-4 bg-white rounded-xl border border-slate-200 shadow-sm transition hover:bg-gray-50
                            ${isReorderMode ? "ring-1 ring-blue-200" : ""}`}
                        >
                          {isReorderMode && (
                            <div
                              {...provided.dragHandleProps}
                              className="absolute top-3 right-3 text-gray-400 cursor-grab"
                            >
                              <i className="bx bx-move" />
                            </div>
                          )}

                          <div>
                            <div className="text-sm text-slate-500">{card.title}</div>
                            <div className={`text-xl font-bold mt-1 ${card.color ?? "text-slate-900"}`}>
                              {card.value}
                            </div>
                          </div>
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

      {/* ================= Card Selection Modal ================= */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-[420px] shadow-xl border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-lg">Select Cards</h3>
                <p className="text-xs text-slate-500">Maximum of 3 cards</p>
              </div>
              <button
                onClick={() => setShowCardModal(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                <i className="bx bx-x text-xl" />
              </button>
            </div>

            {/* Body */}
            <DragDropContext
              onDragEnd={(result) => {
                if (!result.destination) return;
                const reordered = Array.from(cards);
                const [removed] = reordered.splice(result.source.index, 1);
                reordered.splice(result.destination.index, 0, removed);
                setCards(reordered);
              }}
            >
              <Droppable droppableId="modal" direction="vertical">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="p-4 space-y-2 max-h-[300px] overflow-auto"
                  >
                    {cards.map((card, index) => {
                      const checked = visibleCardIds.includes(card.id);
                      const disabled = !checked && visibleCardIds.length >= 3;

                      return (
                        <Draggable
                          key={card.id}
                          draggableId={card.id}
                          index={index}
                          isDragDisabled={!isReorderMode}
                        >
                          {(provided) => (
                            <label
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`flex items-center justify-between p-3 rounded-lg border transition
                                ${checked ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200"}
                                ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
                            >
                              <span className="text-sm font-medium">{card.title}</span>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleVisibleCard(card.id)}
                                className="w-4 h-4"
                              />
                            </label>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Footer */}
            <div className="flex justify-end px-4 py-3 border-t border-slate-200">
              <button
                onClick={() => setShowCardModal(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
