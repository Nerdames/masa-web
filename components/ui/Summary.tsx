"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import SummarySettingsModal, {
  SummarySettingsState,
} from "@/components/modal/SummarySettingsModal";

/* ---------------- Preference Keys ---------------- */

const VISIBILITY_KEY = "summary"; 
const LAYOUT_KEY = "summary-layout"; 

const DEFAULT_COLUMNS = 3;
const DEFAULT_VISIBLE_COUNT = 3;
const SAVE_DEBOUNCE_MS = 1000;

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
  notifications: { icon: "bx-bell", color: "bg-red-50 text-red-600", border: "border-red-100" },
  overview: { icon: "bx-doughnut-chart", color: "bg-teal-50 text-teal-600", border: "border-teal-100" },
  organizations: { icon: "bx-globe", color: "bg-blue-50 text-blue-600", border: "border-blue-100" },
  personnels: { icon: "bx-user", color: "bg-gray-50 text-gray-600", border: "border-gray-100" },
  branches: { icon: "bx-building", color: "bg-green-50 text-green-600", border: "border-green-100" },
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
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;

  /* ---------------- Page Key ---------------- */

  const pageKey = useMemo(() => {
    if (!pathname) return "unknown-page";

    const segments = pathname.split("/").filter(Boolean);
    const key = segments[segments.length - 1] || "overview";

    return `${key}-page`;
  }, [pathname]);

  /* ---------------- Default Layout ---------------- */

  const getDefaultLayout = useCallback((): SummarySettingsState => {
    return {
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

  /* ---------------- Fetch Logic ---------------- */

  const fetchPreferences = useCallback(async () => {
    if (!organizationId || !userId || status !== "authenticated") return;

    try {
      const visibilityRes = await fetch(
        `/api/preferences?category=LAYOUT&key=${VISIBILITY_KEY}&target=${pageKey}`
      );
      const visibilityData = await visibilityRes.json();

      if (visibilityData.success && visibilityData.preference !== null) {
        const prefVal = visibilityData.preference;
        setShowSummary(prefVal === false ? false : true);
      }

      const layoutRes = await fetch(
        `/api/preferences?category=LAYOUT&key=${LAYOUT_KEY}&target=${pageKey}`
      );
      const layoutData = await layoutRes.json();

      if (layoutData.success && layoutData.preference) {
        setLayout({
          ...getDefaultLayout(),
          ...layoutData.preference,
          showSummary: true,
        });
      } else {
        setLayout(getDefaultLayout());
      }
    } catch (err) {
      console.error("Preference fetch failed", err);
    } finally {
      setPrefsLoaded(true);
    }
  }, [organizationId, userId, status, pageKey, getDefaultLayout]);

  /* ---------------- Effects ---------------- */

  useEffect(() => {
    if (cardsData.length > 0) {
      fetchPreferences();
    }
  }, [fetchPreferences, cardsData.length]);

  useEffect(() => {
    const handleGlobalUpdate = () => fetchPreferences();
    window.addEventListener("preference-update", handleGlobalUpdate);
    return () => window.removeEventListener("preference-update", handleGlobalUpdate);
  }, [fetchPreferences]);

  /* ---------------- Save Layout ---------------- */

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
  const showSkeletons = loading || !prefsLoaded || status === "loading";

  const visibleCards = useMemo(() => {
    const map = new Map(cardsData.map((c) => [c.id, c]));
    return layout.cardOrder
      .map((id) => map.get(id))
      .filter((c): c is SummaryCard => !!c && layout.visibleCardIds.includes(c.id))
      .slice(0, columnCount);
  }, [layout, columnCount, cardsData]);

  const routeIconConfig = useMemo(() => {
    if (!pathname) return ROUTE_ICON_MAP.default;

    const segments = pathname.split("/").filter(Boolean);
    const relevantSegments = segments[0] === "dashboard" ? segments.slice(1) : segments;
    const key = relevantSegments[relevantSegments.length - 1] || "overview";

    return ROUTE_ICON_MAP[key] ?? ROUTE_ICON_MAP.default;
  }, [pathname]);

  /* ---------------- UI Render Guard ---------------- */

  if (prefsLoaded && !showSummary) return null;

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
          className="overflow-hidden"
        >
          <div className="relative group">

            {/* Cards */}
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))` }}
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

            {/* Floating Edit Button */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="relative group/edit">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center shadow-sm"
                >
                  <i className="bx bx-cog text-lg text-gray-400" />
                </button>

                <div className="absolute right-10 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 text-white text-[10px] px-2 py-1 opacity-0 group-hover/edit:opacity-100 transition">
                  Edit
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}