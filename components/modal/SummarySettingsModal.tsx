"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import ConfirmModal from "@/components/modal/ConfirmModal";

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
        showTooltips: initialState.showTooltips ?? true,
        showIcons: initialState.showIcons ?? true,
      });
    }
  }, [open, initialState, cardsData]);

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

  const visibleCardsInOrder = useMemo(() => {
    return state.cardOrder
      .filter(id => state.visibleCardIds.includes(id))
      .map(id => cardsData.find(c => c.id === id))
      .filter((c): c is SummaryCard => !!c);
  }, [state.cardOrder, state.visibleCardIds, cardsData]);

  const toggleVisibleCard = useCallback((id: string) => {
    setState((prev) => {
      const isCurrentlyVisible = prev.visibleCardIds.includes(id);
      if (isCurrentlyVisible) {
        if (prev.visibleCardIds.length <= MIN_COLUMNS) return prev;
        return { ...prev, visibleCardIds: prev.visibleCardIds.filter((x) => x !== id) };
      } else {
        // Enforce column limit
        if (prev.visibleCardIds.length >= prev.maxColumns) return prev;
        return { ...prev, visibleCardIds: [...prev.visibleCardIds, id] };
      }
    });
  }, []);

  const setMaxColumns = useCallback((cols: number) => {
    setState((prev) => {
      const newVisible = prev.visibleCardIds.slice(0, cols);
      return { ...prev, maxColumns: cols, visibleCardIds: newVisible };
    });
  }, []);

  const reorderVisibleCards = useCallback((newOrderIds: string[]) => {
    setState((prev) => {
      const nonVisibleIds = prev.cardOrder.filter(id => !prev.visibleCardIds.includes(id));
      return {
        ...prev,
        cardOrder: [...newOrderIds, ...nonVisibleIds]
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
  }, [cardsData]);

  const handleSave = useCallback(() => {
    const changes: Partial<SummarySettingsState> = {};
    (Object.keys(state) as Array<keyof SummarySettingsState>).forEach((key) => {
      if (JSON.stringify(state[key]) !== JSON.stringify(initialState[key])) {
        changes[key] = state[key] as any;
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
            className="fixed top-5 h-full inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="bg-[#F2F2F7]/95 backdrop-blur-3xl rounded-[16px] shadow-[0_30px_80px_rgba(0,0,0,0.3)] border border-white/40 w-full max-w-[800px] h-[540px] flex overflow-hidden text-[#1d1d1f]"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Sidebar */}
              <aside className="w-[240px] bg-[#F5F5F7] border-r border-[#D1D1D6] p-5 flex flex-col">
                <div className="mb-8 px-1">
                   <button onClick={requestClose} className="group flex items-center text-[13px] border border-[#D1D1D6] rounded-full p-1 bg-white font-medium text-black/40 hover:text-black transition-colors">
                      Close
                   </button>
                </div>

                <nav className="space-y-1" >
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-widest">Configuration</p>
                  {[
                    { id: 'appearance', label: 'Appearance', icon: 'bx-palette' },
                    { id: 'visibility', label: 'Card Visibility', icon: 'bx-layer' }
                  ].map(tab => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-3 py-2 mb-4 rounded-[8px] text-[13px] font-medium transition-all ${activeTab === tab.id ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'hover:bg-black/5 text-black/70'}`}
                    >
                      <i className={`bx ${tab.icon} text-lg block`} /> {tab.label}
                    </button>
                  ))}
                </nav>
              </aside>

              {/* Main Content */}
              <div className="flex-1 flex flex-col bg-white/30">
                <header className="px-10 pt-10 pb-6">
                  <h2 className="text-[24px] font-bold tracking-tight">
                    {activeTab === 'appearance' ? 'Appearance' : 'Visibility'}
                  </h2>
                </header>

                <main className="flex-1 px-10 overflow-y-auto space-y-8 pb-8 custom-scrollbar">
                  {activeTab === 'appearance' ? (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
                      <section>
                        <p className="text-[14px] font-semibold mb-4">Grid Layout</p>
                        <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1">
                          {[3, 4].map((c) => (
                            <button
                              key={c}
                              onClick={() => setMaxColumns(c)}
                              className={`px-6 py-1.5 rounded-[7px] text-[12px] font-bold transition-all ${state.maxColumns === c ? "bg-white shadow-sm text-blue-600" : "text-black/40 hover:text-black/60"}`}
                            >
                              {c} Columns
                            </button>
                          ))}
                        </div>
                      </section>

                      <section>
                        <div className="flex justify-between items-end mb-4">
                            <p className="text-[14px] font-semibold">Active Arrangement</p>
                            <span className="text-[11px] text-black/40 italic">Drag to reorder active items</span>
                        </div>
                        <Reorder.Group
                          axis="x"
                          values={visibleCardsInOrder.map((c) => c.id)}
                          onReorder={reorderVisibleCards}
                          className="flex gap-3"
                        >
                          <AnimatePresence mode="popLayout">
                            {visibleCardsInOrder.map((card) => (
                              <Reorder.Item key={card.id} value={card.id} whileDrag={{ scale: 1.05, zIndex: 10 }} className="flex-1 min-w-0">
                                <div className="h-20 bg-white/90 border border-black/5 rounded-[12px] shadow-sm flex items-center justify-center px-3 text-center cursor-grab active:cursor-grabbing group transition-all hover:border-blue-400 hover:shadow-md">
                                  <span className="text-[10px] font-bold text-black/60 group-hover:text-blue-600 uppercase tracking-tight leading-tight line-clamp-2">{card.title}</span>
                                </div>
                              </Reorder.Item>
                            ))}
                          </AnimatePresence>
                        </Reorder.Group>
                      </section>

                      <section className="space-y-3">
                        <div className="bg-white/70 border border-black/5 rounded-[14px] overflow-hidden divide-y divide-black/5">
                          {[
                            { label: "Show Icons", key: "showIcons", icon: "bx-category", color: "text-purple-500" },
                            { label: "Enable Tooltips", key: "showTooltips", icon: "bx-info-circle", color: "text-blue-500" }
                          ].map((opt) => (
                            <div key={opt.key} className="flex justify-between items-center px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center`}>
                                  <i className={`bx ${opt.icon} ${opt.color} text-lg`} />
                                </div>
                                <span className="text-[14px] font-medium">{opt.label}</span>
                              </div>
                              <button 
                                onClick={() => setState(p => ({...p, [opt.key]: !p[opt.key as keyof SummarySettingsState]}))}
                                className={`w-10 h-[22px] rounded-full transition-colors relative flex items-center ${state[opt.key as keyof SummarySettingsState] ? 'bg-[#34C759]' : 'bg-black/10'}`}
                              >
                                <motion.div animate={{ x: state[opt.key as keyof SummarySettingsState] ? 20 : 2 }} className="w-4 h-4 bg-white rounded-full shadow-md" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[11px] font-bold text-black/30 uppercase tracking-widest">Select Cards ({state.visibleCardIds.length} of {state.maxColumns})</span>
                        <button onClick={resetDefaults} className="group flex items-center gap-1.5 text-[11px] font-bold text-blue-500 hover:text-blue-700 transition-colors">
                          <i className="bx bx-reset text-base" /> RESET
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {orderedCards.map((card) => {
                          const checked = state.visibleCardIds.includes(card.id);
                          const { icon, color } = iconMap[card.type ?? "default"] ?? { icon: "bx-question", color: "bg-gray-400" };
                          const canSelectMore = checked || state.visibleCardIds.length < state.maxColumns;

                          return (
                            <div 
                              key={card.id} 
                              onClick={() => canSelectMore && toggleVisibleCard(card.id)}
                              className={`flex items-center justify-between p-3.5 rounded-[12px] border transition-all ${checked ? "bg-blue-500/[0.04] border-blue-500/30" : "bg-white/60 border-black/5 hover:border-black/20"} ${!canSelectMore && !checked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm ${color}`}>
                                  <i className={`bx ${icon} text-xl`} />
                                </div>
                                <span className={`text-[14px] font-semibold ${checked ? "text-blue-700" : "text-black/80"}`}>{card.title}</span>
                              </div>
                              <div
                                className={`w-6 h-6 flex items-center justify-center rounded-full border transition-all ${checked ? "bg-blue-500 text-white border-blue-600" : "bg-white border-black/10 text-transparent"}`}
                              >
                                <i className="bx bx-check text-base font-bold" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </main>

                <footer className="p-6 px-10 bg-black/[0.02] border-t border-black/5 flex justify-end items-center gap-4">
                  <button onClick={onClose} className="px-5 py-2 text-[14px] font-medium text-black/50 hover:text-black transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={`px-10 py-2 rounded-[10px] text-[14px] font-bold transition-all ${isDirty ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 active:scale-95 hover:bg-blue-500" : "bg-black/5 text-black/20 cursor-not-allowed"}`}
                  >
                    Save Changes
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