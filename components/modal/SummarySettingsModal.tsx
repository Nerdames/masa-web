"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import ConfirmModal from "@/components/modal/ConfirmModal";

/* -------------------------------------------------------------------------- */
/* State Schema */
/* -------------------------------------------------------------------------- */

export type SummarySettingsState = {
  visibleCardIds: string[];
  cardOrder: string[];

  /* Layout */
  columns: number;
  gap: "gap-2" | "gap-3" | "gap-4" | "gap-6";
  density: "compact" | "comfortable" | "spacious";

  /* Style */
  cardBg: "bg-white" | "bg-slate-50" | "bg-blue-50/30" | "bg-neutral-100";
  borderColor: "border-gray-100" | "border-blue-200" | "border-neutral-200" | "border-transparent";
  borderRadius: "rounded-lg" | "rounded-xl" | "rounded-2xl" | "rounded-3xl";
  shadow: "shadow-none" | "shadow-sm" | "shadow-md" | "shadow-lg";
  padding: "p-3" | "p-4" | "p-5" | "p-6";

  /* Typography */
  titleSize: "text-xs" | "text-sm" | "text-base";
  valueSize: "text-xl" | "text-2xl" | "text-3xl";
  fontWeight: "font-semibold" | "font-bold" | "font-extrabold";
  align: "left" | "center" | "right";
  showFooter: boolean;

  /* Behavior */
  showIcons: boolean;
  showTooltips: boolean;
  hoverEffect: "none" | "lift" | "border" | "glow";
  animation: "none" | "fade" | "scale";
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

/* -------------------------------------------------------------------------- */

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

  const MIN_COLUMNS = 2;
  const DEFAULT_MAX_COLUMNS = 6;

  /* Tabs */
  const [activeTab, setActiveTab] = useState<
    "layout" | "visibility" | "style" | "typography" | "behavior"
  >("layout");

  const [confirmOpen, setConfirmOpen] = useState(false);

  /* State */
  const [state, setState] = useState<SummarySettingsState>({
    visibleCardIds: initialState.visibleCardIds ?? [],
    cardOrder: initialState.cardOrder ?? [],

    columns: initialState.columns ?? 4,
    gap: initialState.gap ?? "gap-4",
    density: initialState.density ?? "comfortable",

    cardBg: initialState.cardBg ?? "bg-white",
    borderColor: initialState.borderColor ?? "border-gray-100",
    borderRadius: initialState.borderRadius ?? "rounded-2xl",
    shadow: initialState.shadow ?? "shadow-sm",
    padding: initialState.padding ?? "p-4",

    titleSize: initialState.titleSize ?? "text-sm",
    valueSize: initialState.valueSize ?? "text-2xl",
    fontWeight: initialState.fontWeight ?? "font-bold",
    align: initialState.align ?? "left",
    showFooter: initialState.showFooter ?? true,

    showIcons: initialState.showIcons ?? true,
    showTooltips: initialState.showTooltips ?? true,

    hoverEffect: initialState.hoverEffect ?? "lift",
    animation: initialState.animation ?? "fade",
  });

  /* -------------------------------------------------------------------------- */
  /* Sync when modal opens */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!open) return;

    const allIds = cardsData.map((c) => c.id);

    const syncedOrder = initialState.cardOrder?.length
      ? Array.from(new Set([...initialState.cardOrder, ...allIds]))
      : allIds;

    const syncedVisible = initialState.visibleCardIds?.length
      ? initialState.visibleCardIds
      : allIds.slice(0, initialState.columns ?? 4);

    setState((prev) => ({
      ...prev,
      ...initialState,
      cardOrder: syncedOrder,
      visibleCardIds: syncedVisible,
    }));
  }, [open, cardsData, initialState]);

  /* -------------------------------------------------------------------------- */
  /* Dirty Detection & Close Guard */
  /* -------------------------------------------------------------------------- */

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

  /* -------------------------------------------------------------------------- */
  /* ESC + Outside Click */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        requestClose();
      }
    };

    document.addEventListener("keydown", handleEsc);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, requestClose]);

  /* -------------------------------------------------------------------------- */
  /* Ordered Cards & Logic */
  /* -------------------------------------------------------------------------- */

  const orderedCards = useMemo(() => {
    const idSet = new Set(state.cardOrder);
    const missing = cardsData.filter((c) => !idSet.has(c.id));
    return [
      ...state.cardOrder
        .map((id) => cardsData.find((c) => c.id === id))
        .filter((c): c is SummaryCard => !!c),
      ...missing,
    ];
  }, [state.cardOrder, cardsData]);

  const visibleCardsInOrder = useMemo(() => {
    return state.cardOrder
      .filter((id) => state.visibleCardIds.includes(id))
      .map((id) => cardsData.find((c) => c.id === id))
      .filter((c): c is SummaryCard => !!c);
  }, [state.cardOrder, state.visibleCardIds, cardsData]);

  const toggleVisibleCard = useCallback((id: string) => {
    setState((prev) => {
      const isCurrentlyVisible = prev.visibleCardIds.includes(id);

      if (isCurrentlyVisible) {
        if (prev.visibleCardIds.length <= MIN_COLUMNS) return prev;
        return {
          ...prev,
          visibleCardIds: prev.visibleCardIds.filter((x) => x !== id),
        };
      } else {
        if (prev.visibleCardIds.length >= prev.columns) return prev;
        return {
          ...prev,
          visibleCardIds: [...prev.visibleCardIds, id],
        };
      }
    });
  }, []);

  const setColumns = useCallback((cols: number) => {
    setState((prev) => {
      const newVisible = prev.visibleCardIds.slice(0, cols);
      return { ...prev, columns: cols, visibleCardIds: newVisible };
    });
  }, []);

  const reorderActiveCardsHorizontal = useCallback((newOrderIds: string[]) => {
    setState((prev) => {
      const nonVisibleIds = prev.cardOrder.filter(
        (id) => !prev.visibleCardIds.includes(id)
      );
      return {
        ...prev,
        cardOrder: [...newOrderIds, ...nonVisibleIds],
      };
    });
  }, []);

  const reorderAllCardsVertical = useCallback((newOrderIds: string[]) => {
    setState((prev) => ({
      ...prev,
      cardOrder: [
        ...newOrderIds,
        ...prev.cardOrder.filter((id) => !newOrderIds.includes(id)),
      ],
    }));
  }, []);

  const resetDefaults = useCallback(() => {
    const allIds = cardsData.map((c) => c.id);
    setState((prev) => ({
      ...prev,
      cardOrder: allIds,
      visibleCardIds: allIds.slice(0, 4),
      columns: 4,
    }));
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

  /* -------------------------------------------------------------------------- */
  /* UI Components */
  /* -------------------------------------------------------------------------- */

  const ToggleSwitch = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: () => void;
  }) => (
    <button
      onClick={onChange}
      className={`w-10 h-[22px] rounded-full transition-colors relative flex items-center ${
        checked ? "bg-[#34C759]" : "bg-black/10"
      }`}
    >
      <motion.div
        animate={{ x: checked ? 20 : 2 }}
        className="w-4 h-4 bg-white rounded-full shadow-md"
      />
    </button>
  );

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
            className="fixed top-0 h-full inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="bg-white rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.3)] border border-white/40 w-full max-w-[850px] h-[520px] flex overflow-hidden text-[#1d1d1f]"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Sidebar */}
              <aside className="w-[240px] bg-white/80 backdrop-blur-md border-r border-[#D1D1D6] p-5 flex flex-col">
                <div className="mb-8 px-1">
                  <button
                    onClick={requestClose}
                    className="group flex items-center text-[13px] border border-[#D1D1D6] rounded-full px-3 py-1 bg-white font-medium text-black/40 hover:text-black transition-colors"
                  >
                    Close
                  </button>
                </div>

                <nav className="space-y-1 ">
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-[#8E8E93] uppercase tracking-widest mb-2">
                    Configuration
                  </p>
                  {[
                    { id: "layout", label: "Layout", icon: "bx-grid-alt" },
                    { id: "visibility", label: "Visibility", icon: "bx-layer" },
                    { id: "style", label: "Card Style", icon: "bx-palette" },
                    { id: "typography", label: "Typography", icon: "bx-text" },
                    { id: "behavior", label: "Behavior", icon: "bx-slider-alt" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[13px] font-medium transition-all ${
                        activeTab === tab.id
                          ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                          : "hover:bg-black/5 text-black/70"
                      }`}
                    >
                      <i className={`bx ${tab.icon} text-lg block`} />{" "}
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </aside>

              {/* Main Content */}
              <div className="flex-1 flex flex-col bg-white/30 relative">
                <header className="px-10 pt-10 pb-6 bg-white/80 backdrop-blur-md">
                  <h2 className="text-[24px] font-bold tracking-tight capitalize">
                    {activeTab} Settings
                  </h2>
                </header>

                <main className="flex-1 px-10 bg-white/60 overflow-y-auto space-y-8 pb-24 pt-6 custom-scrollbar">
                  {/* LAYOUT TAB */}
                  {activeTab === "layout" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      <section>
                        <p className="text-[14px] font-semibold mb-4">
                          Grid Layout (Columns)
                        </p>
                        <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1">
                          {[2, 3, 4, 5, 6].map((c) => (
                            <button
                              key={c}
                              onClick={() => setColumns(c)}
                              className={`px-6 py-1.5 rounded-[7px] text-[12px] font-bold transition-all ${
                                state.columns === c
                                  ? "bg-white shadow-sm text-blue-600"
                                  : "text-black/40 hover:text-black/60"
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </section>

                      <section>
                        <div className="flex justify-between items-end mb-4">
                          <p className="text-[14px] font-semibold">
                            Active Arrangement
                          </p>
                          <span className="text-[11px] text-black/40 italic">
                            Drag to reorder active items
                          </span>
                        </div>
                        <Reorder.Group
                          axis="x"
                          values={visibleCardsInOrder.map((c) => c.id)}
                          onReorder={reorderActiveCardsHorizontal}
                          className="flex gap-3 overflow-x-auto pb-2"
                        >
                          <AnimatePresence mode="popLayout">
                            {visibleCardsInOrder.map((card) => (
                              <Reorder.Item
                                key={card.id}
                                value={card.id}
                                whileDrag={{ scale: 1.05, zIndex: 10 }}
                                className="flex-1 min-w-[120px]"
                              >
                                <div className="h-20 bg-white/90 border border-black/5 rounded-[12px] shadow-sm flex items-center justify-center px-3 text-center cursor-grab active:cursor-grabbing group transition-all hover:border-blue-400 hover:shadow-md">
                                  <span className="text-[10px] font-bold text-black/60 group-hover:text-blue-600 uppercase tracking-tight leading-tight line-clamp-2">
                                    {card.title}
                                  </span>
                                </div>
                              </Reorder.Item>
                            ))}
                          </AnimatePresence>
                        </Reorder.Group>
                      </section>

                      <div className="grid grid-cols-2 gap-8 mr-6">
                        <section>
                          <p className="text-[14px] font-semibold mb-4">Gap</p>
                          <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1 flex-wrap">
                            {["gap-2", "gap-3", "gap-4", "gap-6"].map((g) => (
                              <button
                                key={g}
                                onClick={() =>
                                  setState((s) => ({ ...s, gap: g as any }))
                                }
                                className={`px-4 py-1.5 rounded-[7px] text-[12px] font-bold transition-all ${
                                  state.gap === g
                                    ? "bg-white shadow-sm text-blue-600"
                                    : "text-black/40 hover:text-black/60"
                                }`}
                              >
                                {g.replace("gap-", "")}
                              </button>
                            ))}
                          </div>
                        </section>
                        <section>
                          <p className="text-[14px] font-semibold mb-4">
                            Density
                          </p>
                          <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1 flex ">
                            {["compact", "comfortable", "spacious"].map((d) => (
                              <button
                                key={d}
                                onClick={() =>
                                  setState((s) => ({ ...s, density: d as any }))
                                }
                                className={`px-4 py-1.5 rounded-[7px] text-[12px] font-bold capitalize transition-all ${
                                  state.density === d
                                    ? "bg-white shadow-sm text-blue-600"
                                    : "text-black/40 hover:text-black/60"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </section>
                      </div>
                    </motion.div>
                  )}

                  {/* VISIBILITY TAB */}
                  {activeTab === "visibility" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[11px] font-bold text-black/40 uppercase tracking-widest">
                          Select Cards ({state.visibleCardIds.length} of{" "}
                          {state.columns})
                        </span>
                        <button
                          onClick={resetDefaults}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Reset Defaults
                        </button>
                      </div>

                      <Reorder.Group
                        axis="y"
                        values={orderedCards.map((c) => c.id)}
                        onReorder={reorderAllCardsVertical}
                        className="space-y-2"
                      >
                        {orderedCards.map((card) => {
                          const checked = state.visibleCardIds.includes(
                            card.id
                          );
                          return (
                            <Reorder.Item
                              key={card.id}
                              value={card.id}
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <div
                                onClick={() => toggleVisibleCard(card.id)}
                                className={`p-4 rounded-[14px] border flex justify-between items-center transition-all ${
                                  checked
                                    ? "bg-blue-50/50 border-blue-200/60 shadow-sm"
                                    : "bg-white/60 border-black/5 hover:bg-white/80"
                                }`}
                              >
                                <span
                                  className={`text-[14px] font-medium ${
                                    checked ? "text-blue-900" : "text-black/70"
                                  }`}
                                >
                                  {card.title}
                                </span>
                                <ToggleSwitch
                                  checked={checked}
                                  onChange={() => toggleVisibleCard(card.id)}
                                />
                              </div>
                            </Reorder.Item>
                          );
                        })}
                      </Reorder.Group>
                    </motion.div>
                  )}

                  {/* STYLE TAB */}
                  {activeTab === "style" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      {[
                        {
                          label: "Border Radius",
                          key: "borderRadius",
                          options: [
                            "rounded-lg",
                            "rounded-xl",
                            "rounded-2xl",
                            "rounded-3xl",
                          ],
                        },
                        {
                          label: "Card Background",
                          key: "cardBg",
                          options: [
                            "bg-white",
                            "bg-slate-50",
                            "bg-blue-50/30",
                            "bg-neutral-100",
                          ],
                        },
                        {
                          label: "Border Color",
                          key: "borderColor",
                          options: [
                            "border-transparent",
                            "border-gray-100",
                            "border-blue-200",
                            "border-neutral-200",
                          ],
                        },
                        {
                          label: "Shadow",
                          key: "shadow",
                          options: [
                            "shadow-none",
                            "shadow-sm",
                            "shadow-md",
                            "shadow-lg",
                          ],
                        },
                        {
                          label: "Padding",
                          key: "padding",
                          options: ["p-3", "p-4", "p-5", "p-6"],
                        },
                      ].map((group) => (
                        <section key={group.key}>
                          <p className="text-[14px] font-semibold mb-3">
                            {group.label}
                          </p>
                          <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1 flex-wrap">
                            {group.options.map((opt) => (
                              <button
                                key={opt}
                                onClick={() =>
                                  setState((s) => ({
                                    ...s,
                                    [group.key]: opt as any,
                                  }))
                                }
                                className={`px-4 py-1.5 rounded-[7px] text-[12px] font-bold transition-all ${
                                  state[
                                    group.key as keyof SummarySettingsState
                                  ] === opt
                                    ? "bg-white shadow-sm text-blue-600"
                                    : "text-black/40 hover:text-black/60"
                                }`}
                              >
                                {opt.split("-").pop()}
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </motion.div>
                  )}

                  {/* TYPOGRAPHY TAB */}
                  {activeTab === "typography" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      {[
                        {
                          label: "Title Size",
                          key: "titleSize",
                          options: ["text-xs", "text-sm", "text-base"],
                        },
                        {
                          label: "Value Size",
                          key: "valueSize",
                          options: ["text-xl", "text-2xl", "text-3xl"],
                        },
                        {
                          label: "Font Weight",
                          key: "fontWeight",
                          options: [
                            "font-semibold",
                            "font-bold",
                            "font-extrabold",
                          ],
                        },
                        {
                          label: "Alignment",
                          key: "align",
                          options: ["left", "center", "right"],
                        },
                      ].map((group) => (
                        <section key={group.key}>
                          <p className="text-[14px] font-semibold mb-3">
                            {group.label}
                          </p>
                          <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1 flex-wrap">
                            {group.options.map((opt) => (
                              <button
                                key={opt}
                                onClick={() =>
                                  setState((s) => ({
                                    ...s,
                                    [group.key]: opt as any,
                                  }))
                                }
                                className={`px-4 py-1.5 rounded-[7px] text-[12px] font-bold capitalize transition-all ${
                                  state[
                                    group.key as keyof SummarySettingsState
                                  ] === opt
                                    ? "bg-white shadow-sm text-blue-600"
                                    : "text-black/40 hover:text-black/60"
                                }`}
                              >
                                {opt.replace("text-", "").replace("font-", "")}
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}

                      <section>
                        <div className="bg-white/70 border border-black/5 rounded-[14px] overflow-hidden">
                          <div className="flex justify-between items-center px-5 py-4">
                            <span className="text-[14px] font-medium">
                              Show Footer
                            </span>
                            <ToggleSwitch
                              checked={state.showFooter}
                              onChange={() =>
                                setState((s) => ({
                                  ...s,
                                  showFooter: !s.showFooter,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </section>
                    </motion.div>
                  )}

                  {/* BEHAVIOR TAB */}
                  {activeTab === "behavior" && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      <section className="space-y-3">
                        <div className="bg-white/70 border border-black/5 rounded-[14px] overflow-hidden divide-y divide-black/5">
                          {[
                            {
                              label: "Show Icons",
                              key: "showIcons",
                              icon: "bx-category",
                              color: "text-purple-500",
                            },
                            {
                              label: "Enable Tooltips",
                              key: "showTooltips",
                              icon: "bx-info-circle",
                              color: "text-blue-500",
                            },
                          ].map((opt) => (
                            <div
                              key={opt.key}
                              className="flex justify-between items-center px-5 py-4"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center`}
                                >
                                  <i
                                    className={`bx ${opt.icon} ${opt.color} text-lg`}
                                  />
                                </div>
                                <span className="text-[14px] font-medium">
                                  {opt.label}
                                </span>
                              </div>
                              <ToggleSwitch
                                checked={
                                  state[
                                    opt.key as keyof SummarySettingsState
                                  ] as boolean
                                }
                                onChange={() =>
                                  setState((p) => ({
                                    ...p,
                                    [opt.key]: !p[
                                      opt.key as keyof SummarySettingsState
                                    ],
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </section>

                      {[
                        {
                          label: "Hover Effect",
                          key: "hoverEffect",
                          options: ["none", "lift", "border", "glow"],
                        },
                        {
                          label: "Animation",
                          key: "animation",
                          options: ["none", "fade", "scale"],
                        },
                      ].map((group) => (
                        <section key={group.key}>
                          <p className="text-[14px] font-semibold mb-3">
                            {group.label}
                          </p>
                          <div className="inline-flex p-1 bg-black/[0.06] rounded-[10px] gap-1 flex-wrap">
                            {group.options.map((opt) => (
                              <button
                                key={opt}
                                onClick={() =>
                                  setState((s) => ({
                                    ...s,
                                    [group.key]: opt as any,
                                  }))
                                }
                                className={`px-4 py-1.5 rounded-[7px] text-[12px] font-bold capitalize transition-all ${
                                  state[
                                    group.key as keyof SummarySettingsState
                                  ] === opt
                                    ? "bg-white shadow-sm text-blue-600"
                                    : "text-black/40 hover:text-black/60"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </motion.div>
                  )}
                </main>

                {/* Footer pinned to bottom */}
                <footer className="absolute bottom-0 left-0 right-0 p-5 bg-white/80 backdrop-blur-md border-t border-black/5 flex justify-end gap-3 z-10">
                  <button
                    onClick={requestClose}
                    className="px-6 py-2.5 rounded-[10px] text-[13px] font-bold text-black/60 hover:bg-black/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={`px-8 py-2.5 rounded-[10px] text-[13px] font-bold tracking-wide transition-all ${
                      isDirty
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700"
                        : "bg-black/5 text-black/30 cursor-not-allowed"
                    }`}
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