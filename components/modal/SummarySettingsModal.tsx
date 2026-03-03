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
  const [activeTab, setActiveTab] = useState<"appearance" | "visibility">("appearance");

  /* ---------------- Sync on Open ---------------- */
  /**
   * REFINED SYNC LOGIC:
   * 1. Trust the existing arrays in initialState if they have values.
   * 2. Only use .slice() or defaults if the database returns empty arrays.
   * 3. Merges new cards from code (cardsData) into existing user order.
   */
  useEffect(() => {
    if (open) {
      const allIds = cardsData.map((c) => c.id);
      
      const syncedOrder = initialState.cardOrder?.length 
        ? Array.from(new Set([...initialState.cardOrder, ...allIds])) 
        : allIds;

      const syncedVisible = initialState.visibleCardIds?.length
        ? initialState.visibleCardIds
        : allIds.slice(0, initialState.maxColumns ?? MIN_COLUMNS);

      setState({
        ...initialState,
        cardOrder: syncedOrder,
        visibleCardIds: syncedVisible,
        maxColumns: initialState.maxColumns ?? MIN_COLUMNS,
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
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
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
    const idSet = new Set(state.cardOrder);
    const missingCards = cardsData.filter((c) => !idSet.has(c.id));
    return [
      ...state.cardOrder
        .map((id) => cardsData.find((c) => c.id === id))
        .filter((c): c is SummaryCard => !!c),
      ...missingCards,
    ];
  }, [state.cardOrder, cardsData]);

  const visibleCards = useMemo(() => {
    // We map through cardOrder to maintain user's desired sequence
    return state.cardOrder
      .filter(id => state.visibleCardIds.includes(id))
      .map(id => cardsData.find(c => c.id === id))
      .filter((c): c is SummaryCard => !!c)
      .slice(0, state.maxColumns);
  }, [state.cardOrder, state.visibleCardIds, state.maxColumns, cardsData]);

  /* ---------------- Actions ---------------- */
  const toggleVisibleCard = useCallback((id: string) => {
    setState((prev) => {
      const isVisible = prev.visibleCardIds.includes(id);
      if (isVisible) {
        if (prev.visibleCardIds.length <= MIN_COLUMNS) return prev;
        return { ...prev, visibleCardIds: prev.visibleCardIds.filter((x) => x !== id) };
      } else {
        if (prev.visibleCardIds.length >= prev.maxColumns) return prev;
        return { ...prev, visibleCardIds: [...prev.visibleCardIds, id] };
      }
    });
  }, [MIN_COLUMNS]);

  const setMaxColumns = useCallback((cols: number) => {
    setState((prev) => ({ ...prev, maxColumns: cols }));
  }, []);

  const reorderVisibleCards = useCallback((newOrder: string[]) => {
    setState((prev) => {
      // Create a map of where visible cards sit in the master order
      const newCardOrder = [...prev.cardOrder];
      let visibleIdx = 0;
      
      return {
        ...prev,
        cardOrder: newCardOrder.map(id => 
          prev.visibleCardIds.includes(id) ? newOrder[visibleIdx++] : id
        )
      };
    });
  }, []);

  const resetDefaults = useCallback(() => {
    const allIds = cardsData.map((c) => c.id);
    setState({
      cardOrder: allIds,
      visibleCardIds: allIds.slice(0, MAX_COLUMNS),
      maxColumns: MAX_COLUMNS,
      showTooltips: true,
      showIcons: true,
    });
  }, [cardsData, MAX_COLUMNS]);

  const handleSave = useCallback(() => {
    const changes: Partial<SummarySettingsState> = {};
    Object.keys(state).forEach((key) => {
      const k = key as keyof SummarySettingsState;
      if (JSON.stringify(state[k]) !== JSON.stringify(initialState[k])) {
        changes[k] = state[k] as any;
      }
    });
    onSave(state, changes, pageKey);
  }, [state, initialState, onSave, pageKey]);

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
            className="fixed inset-0 z-[100] bg-black/25 backdrop-blur-[2px] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="bg-[#F2F2F7]/95 backdrop-blur-3xl rounded-[12px] shadow-[0_30px_80px_rgba(0,0,0,0.35)] border border-white/40 w-full max-w-[760px] h-[500px] flex overflow-hidden text-[#1d1d1f]"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              <aside className="w-[220px] bg-black/[0.04] border-r border-black/5 p-4 flex flex-col">
                <div className="mb-8 px-1">
                   <button onClick={requestClose} className="text-[13px] font-medium text-black/40 hover:text-black transition-colors">
                     <i className="bx bx-chevron-left mr-1" /> Close
                   </button>
                </div>

                <nav className="space-y-0.5">
                  <p className="px-3 py-1.5 text-[11px] font-bold text-black/30 uppercase tracking-tight">Summary</p>
                  {[
                    { id: 'appearance', label: 'Appearance', icon: 'bx-palette' },
                    { id: 'visibility', label: 'Visibility', icon: 'bx-list-ul' }
                  ].map(tab => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-[13px] font-medium transition-all ${activeTab === tab.id ? 'bg-blue-500 text-white shadow-md' : 'hover:bg-black/5 text-black/70'}`}
                    >
                      <i className={`${tab.icon} text-base`} /> {tab.label}
                    </button>
                  ))}
                </nav>
              </aside>

              <div className="flex-1 flex flex-col bg-white/40">
                <header className="px-8 pt-8 pb-4">
                  <h2 className="text-[20px] font-bold tracking-tight">
                    {activeTab === 'appearance' ? 'Appearance Settings' : 'Card Visibility'}
                  </h2>
                </header>

                <main className="flex-1 px-8 overflow-y-auto space-y-8 pb-6 custom-scrollbar">
                  {activeTab === 'appearance' ? (
                    <motion.div initial={{ opacity: 0, x: 5 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                      <section>
                        <p className="text-[13px] font-semibold mb-3">Grid Layout</p>
                        <div className="inline-flex p-1 bg-black/5 rounded-[9px] gap-1">
                          {[3, 4].map((c) => (
                            <button
                              key={c}
                              onClick={() => setMaxColumns(c)}
                              className={`px-5 py-1.5 rounded-[6px] text-[12px] font-bold transition-all ${state.maxColumns === c ? "bg-white shadow-sm text-blue-600" : "text-black/40 hover:text-black/60"}`}
                            >
                              {c} Columns
                            </button>
                          ))}
                        </div>
                      </section>

                      <section>
                        <div className="flex justify-between items-end mb-3">
                           <p className="text-[13px] font-semibold">Active Arrangement</p>
                           <span className="text-[11px] text-black/30">Drag cards to reorder</span>
                        </div>
                        <Reorder.Group
                          axis="x"
                          values={visibleCards.map((c) => c.id)}
                          onReorder={reorderVisibleCards}
                          className="flex gap-2"
                        >
                          <AnimatePresence mode="popLayout">
                            {visibleCards.map((card) => (
                              <Reorder.Item key={card.id} value={card.id} whileDrag={{ scale: 1.05, zIndex: 10 }} className="flex-1 min-w-0">
                                <div className="h-16 bg-white/80 border border-black/5 rounded-[10px] shadow-sm flex items-center justify-center px-2 text-center cursor-grab active:cursor-grabbing group transition-colors hover:border-blue-200">
                                  <span className="text-[10px] font-bold text-black/50 group-hover:text-blue-500 uppercase leading-tight truncate">{card.title}</span>
                                </div>
                              </Reorder.Item>
                            ))}
                          </AnimatePresence>
                        </Reorder.Group>
                      </section>

                      <section className="space-y-2">
                        <div className="bg-white/60 border border-black/5 rounded-[12px] overflow-hidden divide-y divide-black/5">
                          {[
                            { label: "Show Icons", key: "showIcons", icon: "bx-category" },
                            { label: "Enable Tooltips", key: "showTooltips", icon: "bx-info-circle" }
                          ].map((opt) => (
                            <div key={opt.key} className="flex justify-between items-center px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 bg-blue-500/10 rounded-md flex items-center justify-center">
                                  <i className={`bx ${opt.icon} text-blue-600 text-base`} />
                                </div>
                                <span className="text-[13px] font-medium">{opt.label}</span>
                              </div>
                              <button 
                                onClick={() => setState(p => ({...p, [opt.key]: !p[opt.key as keyof SummarySettingsState]}))}
                                className={`w-9 h-[20px] rounded-full transition-colors relative flex items-center ${state[opt.key as keyof SummarySettingsState] ? 'bg-[#34C759]' : 'bg-black/10'}`}
                              >
                                <motion.div animate={{ x: state[opt.key as keyof SummarySettingsState] ? 18 : 2 }} className="w-4 h-4 bg-white rounded-full shadow-sm" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0, x: 5 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-black/40 uppercase tracking-tight">Available Cards ({state.visibleCardIds.length}/{state.maxColumns})</span>
                        <Tooltip content="Restore Defaults">
                          <button onClick={resetDefaults} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 text-black/60">
                            <i className="bx bx-reset text-lg" />
                          </button>
                        </Tooltip>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {orderedCards.map((card) => {
                          const checked = state.visibleCardIds.includes(card.id);
                          const { icon, color } = iconMap[card.type ?? "default"] ?? { icon: "bx-question", color: "bg-gray-300" };
                          const canSelectMore = checked || state.visibleCardIds.length < state.maxColumns;

                          return (
                            <div key={card.id} className={`flex items-center justify-between p-3 rounded-[10px] border transition-all ${checked ? "bg-blue-500/5 border-blue-500/20" : "bg-white/50 border-black/5"}`}>
                              <div className="flex items-center gap-3">
                                {state.showIcons && (
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm ${color}`}>
                                    <i className={`bx ${icon} text-lg`} />
                                  </div>
                                )}
                                <span className="text-[13px] font-semibold text-black/80">{card.title}</span>
                              </div>
                              <button
                                onClick={() => canSelectMore && toggleVisibleCard(card.id)}
                                disabled={!canSelectMore}
                                className={`w-6 h-6 flex items-center justify-center rounded-[6px] border transition-all ${checked ? "bg-blue-500 text-white border-blue-600" : "bg-white border-black/10 text-transparent"} ${!canSelectMore && !checked ? "opacity-20 cursor-not-allowed" : "hover:border-blue-400"}`}
                              >
                                <i className="bx bx-check text-base" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </main>

                <footer className="p-5 px-8 bg-white/20 border-t border-black/5 flex justify-end items-center gap-3">
                  <button onClick={onClose} className="px-4 py-1.5 text-[13px] font-medium text-black/60 hover:text-black transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={`px-8 py-1.5 rounded-[8px] text-[13px] font-semibold transition-all shadow-md ${isDirty ? "bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-blue-500/20 active:scale-95" : "bg-black/5 text-black/20 shadow-none cursor-not-allowed"}`}
                  >
                    Done
                  </button>
                </footer>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}