"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import SummarySettingsModal, {
  SummarySettingsState,
} from "@/components/modal/SummarySettingsModal";

/* ---------------- Preference Keys ---------------- */

const VISIBILITY_KEY = "summary"; // 👈 controlled by PreferencePage
const LAYOUT_KEY = "summary-layout"; // 👈 controlled here

const DEFAULT_COLUMNS = 4;
const DEFAULT_VISIBLE_COUNT = 4;
const SAVE_DEBOUNCE_MS = 600;

/* ---------------- Route Icon Map ---------------- */

const ROUTE_ICON_MAP: Record<
  string,
  { icon: string; color: string; border: string }
> = {
  sales: { icon: "bx-chart", color: "bg-blue-50 text-blue-600", border: "border-blue-100" },
  customers: { icon: "bx-group", color: "bg-pink-50 text-pink-600", border: "border-pink-100" },
  vendors: { icon: "bx-store", color: "bg-green-50 text-green-600", border: "border-green-100" },
  invoices: { icon: "bx-receipt", color: "bg-purple-50 text-purple-600", border: "border-purple-100" },
  orders: { icon: "bx-cart", color: "bg-orange-50 text-orange-600", border: "border-orange-100" },
  inventory: { icon: "bx-box", color: "bg-yellow-50 text-yellow-600", border: "border-yellow-100" },
  stock: { icon: "bx-bar-chart", color: "bg-emerald-50 text-emerald-600", border: "border-emerald-100" },
  notifications: { icon: "bx-bell", color: "bg-red-50 text-red-600", border: "border-red-100" },
  overview: { icon: "bx-doughnut-chart", color: "bg-teal-50 text-teal-600", border: "border-teal-100" },
  organizations: { icon: "bx-building", color: "bg-blue-50 text-blue-600", border: "border-blue-100" },
  default: { icon: "bx-card", color: "bg-gray-50 text-gray-500", border: "border-gray-100" },
};

/* ---------------- Types ---------------- */

export type SummaryCard = {
  id: string;
  title: string;
  value: number | string;
  change?: number;
};

interface SummaryProps {
  cardsData: SummaryCard[];
  loading?: boolean;
}

/* ---------------- Component ---------------- */

export default function Summary({ cardsData, loading = false }: SummaryProps) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;

  /* ---------------- Page Key ---------------- */

  const pageKey = useMemo(() => {
    if (!pathname) return "unknown-page";
    const segments = pathname.split("/").filter(Boolean);
    const key =
      segments[0] === "dashboard" && segments[1]
        ? segments[1]
        : segments[segments.length - 1] || "overview";
    return `${key}-page`;
  }, [pathname]);

  /* ---------------- Default Layout ---------------- */

  const getDefaultLayout = useCallback((): SummarySettingsState => {
    return {
      showSummary: true,
      visibleCardIds: cardsData.slice(0, DEFAULT_VISIBLE_COUNT).map((c) => c.id),
      cardOrder: cardsData.map((c) => c.id),
      maxColumns: DEFAULT_COLUMNS,
      showTooltips: true,
      showIcons: true,
    };
  }, [cardsData]);

  /* ---------------- State ---------------- */

  const [layout, setLayout] = useState<SummarySettingsState>(() =>
    getDefaultLayout()
  );

  const [showSummary, setShowSummary] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ---------------- Load Preferences ---------------- */

  useEffect(() => {
    if (!organizationId || !userId || !cardsData.length) return;

    const fetchPreferences = async () => {
      try {
        // 1️⃣ Visibility
        const visibilityRes = await fetch(
          `/api/preferences?category=LAYOUT&key=${VISIBILITY_KEY}&target=${pageKey}`
        );
        const visibilityData = await visibilityRes.json();

        if (visibilityData.success && visibilityData.preference) {
          setShowSummary(
            visibilityData.preference.showSummary ?? true
          );
        }

        // 2️⃣ Layout
        const layoutRes = await fetch(
          `/api/preferences?category=LAYOUT&key=${LAYOUT_KEY}&target=${pageKey}`
        );
        const layoutData = await layoutRes.json();

        if (layoutData.success && layoutData.preference) {
          setLayout({
            ...getDefaultLayout(),
            ...layoutData.preference,
            showSummary: true, // 👈 layout never controls visibility
          });
        } else {
          setLayout(getDefaultLayout());
        }
      } catch {
        setLayout(getDefaultLayout());
      } finally {
        setPrefsLoaded(true);
      }
    };

    fetchPreferences();
  }, [organizationId, userId, pageKey, cardsData, getDefaultLayout]);

  /* ---------------- Save Layout Only ---------------- */

  const saveLayout = useCallback(
    (newLayout: SummarySettingsState) => {
      if (!organizationId || !userId) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: LAYOUT_KEY,
              value: newLayout,
              scope: "USER",
              target: pageKey,
              category: "LAYOUT",
            }),
          });
        } catch {
          console.error("Layout save failed");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [organizationId, userId, pageKey]
  );

  /* ---------------- Derived ---------------- */

  const columnCount = layout.maxColumns;
  const showSkeletons = loading || !prefsLoaded;

  const visibleCards = useMemo(() => {
    const map = new Map(cardsData.map((c) => [c.id, c]));
    return layout.cardOrder
      .map((id) => map.get(id))
      .filter(
        (c): c is SummaryCard =>
          !!c && layout.visibleCardIds.includes(c.id)
      )
      .slice(0, columnCount);
  }, [layout, columnCount, cardsData]);

  const routeIconConfig = useMemo(() => {
    if (!pathname) return ROUTE_ICON_MAP.default;
    const segments = pathname.split("/").filter(Boolean);
    const key =
      segments[0] === "dashboard" && segments[1]
        ? segments[1]
        : segments[segments.length - 1] || "overview";
    return ROUTE_ICON_MAP[key] ?? ROUTE_ICON_MAP.default;
  }, [pathname]);

  /* ---------------- Respect Visibility ---------------- */

  if (!showSummary) return null;

  /* ---------------- UI ---------------- */

  return (
    <>
      <SummarySettingsModal
        pageKey={pageKey}
        open={settingsOpen}
        cardsData={cardsData}
        iconMap={ROUTE_ICON_MAP}
        initialState={layout}
        onClose={() => setSettingsOpen(false)}
        onSave={(newLayout) => {
          setLayout(newLayout);
          saveLayout(newLayout);
          setSettingsOpen(false);
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key="summary-content"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-4 overflow-hidden py-4"
        >
          <div className="flex justify-between items-center px-2">
            <div className="flex flex-col">
              <span className="text-lg font-bold text-gray-900">
                Overview
              </span>
              <p className="text-[11px] text-gray-400 font-medium">
                Performance Metrics
              </p>
            </div>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center shadow-sm">
                  <i className="bx bx-dots-horizontal-rounded text-lg text-gray-400" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-[160px] rounded-xl border border-gray-100 bg-white p-1 shadow-xl"
              >
                <DropdownMenu.Item
                  onSelect={() => setSettingsOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 rounded-lg"
                >
                  <i className="bx bx-cog text-sm" />
                  Customize Layout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>

          <div
            className="grid gap-4 px-2"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))`,
            }}
          >
            {showSkeletons
              ? Array.from({ length: columnCount }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm animate-pulse h-[112px]"
                  />
                ))
              : visibleCards.map((card) => {
                  const { icon, color, border } = routeIconConfig;
                  const isPositive = (card.change ?? 0) >= 0;

                  return (
                    <div
                      key={card.id}
                      className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">
                            {card.title}
                          </p>
                          <h3 className="text-2xl font-extrabold text-gray-900">
                            {typeof card.value === "number"
                              ? card.value.toLocaleString()
                              : card.value}
                          </h3>
                        </div>

                        {layout.showIcons && (
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center border ${border} ${color}`}
                          >
                            <i className={`bx ${icon}`} />
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <div
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {Math.abs(card.change ?? 0)}%
                        </div>
                        <span className="text-[10px] text-gray-400">
                          vs last month
                        </span>
                      </div>
                    </div>
                  );
                })}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}