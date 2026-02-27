"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import ConfirmModal from "@/components/modal/ConfirmModal";
import { Tooltip } from "@/components/feedback/Tooltip";

export type SummarySettingsState = {
  visibleCardIds: string[];
  cardOrder: string[];
  maxColumns: number;
  showTooltips: boolean;
  showIcons: boolean;
};

type SummaryCard = {
  id: string;
  title: string;
  type?: string;
};

interface Props {
  pageKey: string;
  open: boolean;
  cardsData: SummaryCard[];
  iconMap: Record<string, { icon: string; color: string }>;
  initialState: SummarySettingsState;
  onClose: () => void;
  onSave: (
    state: SummarySettingsState,
    changedKeys?: Partial<SummarySettingsState>,
    pageKey?: string
  ) => void;
}

export default function SummarySettingsModal({
  pageKey,
  open,
  cardsData,
  iconMap,
  initialState,
  onClose,
  onSave,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

  const MIN_COLUMNS = 3;
  const MAX_COLUMNS = 4;

  const [state, setState] = useState<SummarySettingsState>({
    visibleCardIds: initialState.visibleCardIds ?? [],
    cardOrder: initialState.cardOrder ?? [],
    maxColumns: initialState.maxColumns ?? MIN_COLUMNS,
    showTooltips: initialState.showTooltips ?? true,
    showIcons: initialState.showIcons ?? true,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);

  /* ---------------- Sync on Open ---------------- */
  useEffect(() => {
    if (open) {
      const allIds = cardsData.map((c) => c.id);
      const visibleIds = initialState.visibleCardIds.slice(0, initialState.maxColumns);
      setState({
        ...initialState,
        cardOrder: Array.from(new Set([...initialState.cardOrder, ...allIds])),
        visibleCardIds: Array.from(
          new Set([...visibleIds, ...allIds.slice(0, initialState.maxColumns)])
        ),
      });
    }
  }, [open, initialState, cardsData]);

  /* ---------------- Dirty Check ---------------- */
  const isDirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(initialState),
    [state, initialState]
  );

  const requestClose = useCallback(() => {
    if (isDirty) setConfirmOpen(true);
    else onClose();
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setConfirmOpen(false);
    onClose();
  }, [onClose]);

  /* ---------------- ESC Key + Outside Click ---------------- */
  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) requestClose();
    };

    document.addEventListener("keydown", handleEsc);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, requestClose]);

  /* ---------------- Derived Data ---------------- */
  const orderedCards = useMemo(() => {
    if (!state) return [];
    const idSet = new Set(state.cardOrder || []);
    const missingCards = cardsData.filter((c) => !idSet.has(c.id));
    return [
      ...state.cardOrder
        .map((id) => cardsData.find((c) => c.id === id))
        .filter((c): c is SummaryCard => c !== undefined),
      ...missingCards,
    ];
  }, [state, cardsData]);

  const visibleCards = useMemo(() => {
    if (!state) return [];
    return orderedCards
      .filter((c) => state.visibleCardIds.includes(c.id))
      .slice(0, state.maxColumns);
  }, [orderedCards, state]);

  /* ---------------- Actions ---------------- */
  const toggleVisibleCard = useCallback((id: string) => {
    setState((prev) => {
      const isVisible = prev.visibleCardIds.includes(id);

      let newVisible: string[];
      if (isVisible) {
        if (prev.visibleCardIds.length <= MIN_COLUMNS) return prev;
        newVisible = prev.visibleCardIds.filter((x) => x !== id);
      } else {
        if (prev.visibleCardIds.length >= prev.maxColumns) return prev;
        newVisible = [...prev.visibleCardIds, id];
      }

      const newCardOrder = newVisible.reduce(
        (acc, v) => (acc.includes(v) ? acc : [...acc, v]),
        prev.cardOrder
      );

      return { ...prev, visibleCardIds: newVisible, cardOrder: newCardOrder };
    });
  }, []);

  const setMaxColumns = useCallback((cols: number) => {
    const clamped = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, cols));
    setState((prev) => {
      let newVisible = [...prev.visibleCardIds];

      if (newVisible.length > clamped) {
        newVisible = newVisible.slice(0, clamped);
      } else if (newVisible.length < clamped) {
        const missingCards = prev.cardOrder.filter((id) => !newVisible.includes(id));
        newVisible = [...newVisible, ...missingCards.slice(0, clamped - newVisible.length)];
      }

      return { ...prev, maxColumns: clamped, visibleCardIds: newVisible };
    });
  }, []);

  const reorderVisibleCards = useCallback((newOrder: string[]) => {
    setState((prev) => {
      const newCardOrder = [...prev.cardOrder];
      let vi = 0;
      for (let i = 0; i < newCardOrder.length; i++) {
        if (prev.visibleCardIds.includes(newCardOrder[i])) {
          newCardOrder[i] = newOrder[vi++];
        }
      }
      return { ...prev, cardOrder: newCardOrder };
    });
  }, []);

  const resetDefaults = useCallback(() => {
    const allIds = cardsData.map((c) => c.id);
    const visibleIds = initialState.visibleCardIds.slice(0, initialState.maxColumns);
    setState({
      ...initialState,
      cardOrder: Array.from(new Set([...initialState.cardOrder, ...allIds])),
      visibleCardIds: Array.from(new Set([...visibleIds, ...allIds])).slice(
        0,
        initialState.maxColumns
      ),
    });
  }, [initialState, cardsData]);

  const computeChangedKeys = useCallback((): Partial<SummarySettingsState> => {
    const changes: Partial<SummarySettingsState> = {};
    if (JSON.stringify(state.visibleCardIds) !== JSON.stringify(initialState.visibleCardIds))
      changes.visibleCardIds = state.visibleCardIds;
    if (JSON.stringify(state.cardOrder) !== JSON.stringify(initialState.cardOrder))
      changes.cardOrder = state.cardOrder;
    if (state.maxColumns !== initialState.maxColumns) changes.maxColumns = state.maxColumns;
    if (state.showTooltips !== initialState.showTooltips) changes.showTooltips = state.showTooltips;
    if (state.showIcons !== initialState.showIcons) changes.showIcons = state.showIcons;
    return changes;
  }, [state, initialState]);

  const handleSave = useCallback(() => {
    const changedKeys = computeChangedKeys();
    onSave(state, changedKeys, pageKey);
  }, [state, computeChangedKeys, onSave, pageKey]);

  /* ---------------- Render ---------------- */
  return (
    <>
      <ConfirmModal
        open={confirmOpen}
        title="Discard changes?"
        message="You have unsaved changes. Discard them?"
        onConfirm={confirmDiscard}
        onClose={() => setConfirmOpen(false)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center px-4 py-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-[36rem] max-h-[88vh] flex flex-col"
              initial={{ y: 30, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.18 }}
              layout
            >
              {/* Header */}
              <div className="flex justify-between items-center px-5 py-3 border-b">
                <h3 className="font-semibold text-lg">Summary Settings</h3>
                <button onClick={requestClose}>
                  <i className="bx bx-x text-xl" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 flex-1 overflow-y-auto space-y-8">
                {/* Max Columns */}
                <div>
                  <p className="text-sm font-medium mb-2">Max Columns</p>
                  <div className="flex gap-2">
                    {[3, 4].map((c) => (
                      <button
                        key={c}
                        onClick={() => setMaxColumns(c)}
                        className={`px-3 py-1 rounded-lg ${
                          state.maxColumns === c ? "bg-blue-500 text-white" : "bg-gray-100"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview Grid */}
                <motion.div layout>
                  <p className="text-sm font-medium mb-2">Live Preview</p>
                  <Reorder.Group
                    axis="x"
                    values={visibleCards.map((c) => c.id)}
                    onReorder={reorderVisibleCards}
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${state.maxColumns}, minmax(0,1fr))` }}
                  >
                    <AnimatePresence>
                      {visibleCards.map((card) => {
                        const { color } = iconMap[card.type ?? "default"] ?? { color: "bg-gray-300" };
                        return (
                          <Reorder.Item
                            key={card.id}
                            value={card.id}
                            layout
                            whileDrag={{ scale: 1.05 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          >
                            <motion.div className="h-16 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-medium text-slate-500">
                              {card.title}
                            </motion.div>
                          </Reorder.Item>
                        );
                      })}
                      {Array.from({ length: state.maxColumns - visibleCards.length }).map((_, i) => (
                        <div
                          key={`placeholder-${i}`}
                          className="h-16 rounded-lg bg-gray-50 border border-dashed border-slate-200"
                        />
                      ))}
                    </AnimatePresence>
                  </Reorder.Group>
                </motion.div>

                {/* Cards Visibility List */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Cards Visibility</span>
                    <Tooltip content="Reset to branch/organization default">
                      <button
                        onClick={resetDefaults}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
                      >
                        <i className="bx bx-reset" />
                      </button>
                    </Tooltip>
                  </div>

                  <div className="flex flex-col gap-2">
                    {orderedCards.map((card) => {
                      const checked = state.visibleCardIds.includes(card.id);
                      const { icon, color } =
                        iconMap[card.type ?? "default"] ?? { icon: "bx-question", color: "bg-gray-300" };
                      const canSelectMore = checked || state.visibleCardIds.length < state.maxColumns;

                      return (
                        <motion.div
                          key={card.id}
                          layout
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            checked ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {state.showIcons && (
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                                <i className={`bx ${icon}`} />
                              </div>
                            )}
                            <span className="text-sm font-medium">{card.title}</span>
                          </div>

                          <button
                            onClick={() => canSelectMore && toggleVisibleCard(card.id)}
                            disabled={!canSelectMore}
                            className={`w-6 h-6 flex items-center justify-center rounded border transition-colors
                              ${checked ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-slate-300"}
                              ${!canSelectMore && !checked ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"}
                            `}
                          >
                            <i className={`bx ${checked ? "bx-check" : "bx-plus"}`} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end px-5 py-3 border-t">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}