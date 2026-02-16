"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import SummarySettingsModal, { SummarySettingsState } from "@/components/modal/SummarySettingsModal";

/* ---------------- Constants ---------------- */
const PREF_KEY = "summary";
const DEFAULT_COLUMNS = 4;
const DEFAULT_VISIBLE_COUNT = 4;

/* ---------------- Type Icon Map ---------------- */
const CARD_TYPE_ICON_MAP: Record<string, { icon: string; color: string }> = {
  stock: { icon: "bx-bar-chart", color: "bg-green-100 text-green-600" },
  inventory: { icon: "bx-archive", color: "bg-yellow-100 text-yellow-600" },
  sales: { icon: "bx-dollar-circle", color: "bg-blue-100 text-blue-600" },
  default: { icon: "bx-card", color: "bg-gray-100 text-gray-500" },
};

/* ---------------- Types ---------------- */
export type SummaryCard = {
  id: string;
  title: string;
  value: number | string;
  type?: string;
};

interface SummaryProps {
  cardsData: SummaryCard[];
  pageKey: string;
  loading?: boolean;
}

/* ---------------- Component ---------------- */
export default function Summary({ cardsData, pageKey, loading = false }: SummaryProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const branchId = session?.user?.branchId;
  const organizationId = session?.user?.organizationId;

  const [settings, setSettings] = useState<SummarySettingsState>({
    visibleCardIds: [],
    cardOrder: [],
    maxColumns: DEFAULT_COLUMNS,
    showTooltips: true,
    showIcons: true,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  /* ---------------- Load Preferences ---------------- */
  useEffect(() => {
    if (!organizationId || !userId) return;

    const fetchPrefs = async () => {
      try {
        const res = await fetch(
          `/api/preferences?organizationId=${organizationId}&branchId=${branchId ?? ""}&personnelId=${userId}&scope=USER&key=${PREF_KEY}`
        );
        const data = await res.json();

        const prefState: Record<string, SummarySettingsState> =
          data?.success && data.preference ? (data.preference as Record<string, SummarySettingsState>) : {};

        const pagePrefs = prefState[pageKey] ?? {
          visibleCardIds: [],
          cardOrder: [],
          maxColumns: DEFAULT_COLUMNS,
          showTooltips: true,
          showIcons: true,
        };

        const allCardIds = cardsData.map((c) => c.id);
        const mergedCardOrder = Array.from(new Set([...pagePrefs.cardOrder, ...allCardIds]));
        const mergedVisibleIds = Array.from(new Set([...pagePrefs.visibleCardIds, ...allCardIds]));
        const finalVisibleIds =
          mergedVisibleIds.length > 0 ? mergedVisibleIds : allCardIds.slice(0, DEFAULT_VISIBLE_COUNT);

        setSettings({
          ...pagePrefs,
          cardOrder: mergedCardOrder,
          visibleCardIds: finalVisibleIds,
        });
      } catch (err) {
        console.error("Failed to fetch preferences", err);
        const defaultIds = cardsData.slice(0, DEFAULT_VISIBLE_COUNT).map((c) => c.id);
        setSettings({
          visibleCardIds: defaultIds,
          cardOrder: cardsData.map((c) => c.id),
          maxColumns: DEFAULT_COLUMNS,
          showTooltips: true,
          showIcons: true,
        });
      } finally {
        setPrefsLoaded(true);
      }
    };

    fetchPrefs();
  }, [cardsData, organizationId, branchId, userId, pageKey]);

  /* ---------------- Save Preferences ---------------- */
  const savePreferences = useCallback(
    async (newState: SummarySettingsState) => {
      if (!organizationId || !userId) return;

      try {
        await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: PREF_KEY,
            value: { [pageKey]: newState },
            scope: "USER",
            target: "summary",
            organizationId,
            branchId: branchId ?? null,
            personnelId: userId,
            category: "LAYOUT",
          }),
        });
      } catch (err) {
        console.error("Failed to save preferences", err);
      }
    },
    [organizationId, branchId, userId, pageKey]
  );

  /* ---------------- Derived Cards ---------------- */
  const orderedCards = useMemo(
    () =>
      settings.cardOrder
        .map((id) => cardsData.find((c) => c.id === id))
        .filter(Boolean) as SummaryCard[],
    [settings.cardOrder, cardsData]
  );

  const visibleCards = useMemo(
    () => orderedCards.filter((c) => settings.visibleCardIds.includes(c.id)).slice(0, settings.maxColumns),
    [orderedCards, settings.visibleCardIds, settings.maxColumns]
  );

  /* ---------------- Skeleton Cards ---------------- */
  const skeletonCards = Array.from({ length: settings.maxColumns }, (_, i) => (
    <motion.div
      key={i}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="bg-white p-6 rounded-xl shadow flex flex-col justify-between animate-pulse"
    >
      <div className="flex justify-between items-start mb-4">
        {/* Left: Title and Value */}
        <div className="space-y-2 flex-1">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-6 w-14 bg-gray-300 rounded" />
        </div>
        {/* Right: Icon */}
        <div className="w-10 h-10 rounded-lg bg-gray-200" />
      </div>
    </motion.div>
  ));

  /* ---------------- UI ---------------- */
  if (!prefsLoaded && !loading) return null;

  return (
    <>
      <SummarySettingsModal
        pageKey={pageKey}
        open={settingsOpen}
        cardsData={cardsData}
        iconMap={CARD_TYPE_ICON_MAP}
        initialState={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={async (newState) => {
          setSettings(newState);
          await savePreferences(newState);
          setSettingsOpen(false);
        }}
      />

      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-900">Overview</span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                aria-label="Open summary settings"
                className="w-9 h-9 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
              >
                <i className="bx bx-dots-vertical-rounded text-lg" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-sm"
            >
              <DropdownMenu.Item
                onSelect={() => setSettingsOpen(true)}
                className="px-4 py-2 text-sm cursor-pointer hover:bg-gray-50"
              >
                Edit Layout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>

        {/* Cards Grid */}
        <motion.div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(${settings.maxColumns}, minmax(0,1fr))` }}
          layout
        >
          <AnimatePresence>
            {loading ? skeletonCards : visibleCards.map((card) => {
              const { icon, color } = CARD_TYPE_ICON_MAP[card.type ?? "default"];
              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="bg-white p-6 rounded-xl shadow flex flex-col justify-between"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-gray-500 text-sm">{card.title}</p>
                      <p className="text-2xl font-bold">{card.value}</p>
                    </div>
                    {settings.showIcons && (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                        <i className={`bx ${icon} text-xl`} />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
