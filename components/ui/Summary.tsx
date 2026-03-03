"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import SummarySettingsModal, {
  SummarySettingsState,
} from "@/components/modal/SummarySettingsModal";

/* ---------------- Constants ---------------- */

const PREF_KEY = "summary";
const DEFAULT_COLUMNS = 4;
const DEFAULT_VISIBLE_COUNT = 4;
const SAVE_DEBOUNCE_MS = 600;

/* ---------------- Route Icon Map ---------------- */

const ROUTE_ICON_MAP: Record<string, { icon: string; color: string; border: string }> = {
  sales: { icon: "bx-chart", color: "bg-blue-50 text-blue-600", border: "border-blue-100" },
  customers: { icon: "bx-group", color: "bg-pink-50 text-pink-600", border: "border-pink-100" },
  vendors: { icon: "bx-store", color: "bg-green-50 text-green-600", border: "border-green-100" },
  invoices: { icon: "bx-receipt", color: "bg-purple-50 text-purple-600", border: "border-purple-100" },
  orders: { icon: "bx-cart", color: "bg-orange-50 text-orange-600", border: "border-orange-100" },
  inventory: { icon: "bx-box", color: "bg-yellow-50 text-yellow-600", border: "border-yellow-100" },
  stock: { icon: "bx-bar-chart", color: "bg-emerald-50 text-emerald-600", border: "border-emerald-100" },
  notifications: { icon: "bx-bell", color: "bg-red-50 text-red-600", border: "border-red-100" },
  overview: { icon: "bx-doughnut-chart", color: "bg-teal-50 text-teal-600", border: "border-teal-100" },
  settings: { icon: "bx-cog", color: "bg-gray-50 text-gray-600", border: "border-gray-200" },
  profile: { icon: "bx-user", color: "bg-indigo-50 text-indigo-600", border: "border-indigo-100" },
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
  const isMountedRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const userId = session?.user?.id;
  const branchId = session?.user?.branchId;
  const organizationId = session?.user?.organizationId;

  /* ---------------- Default Settings ---------------- */

  const getDefaultSettings = useCallback((): SummarySettingsState => {
    return {
      showSummary: true,
      visibleCardIds: cardsData.slice(0, DEFAULT_VISIBLE_COUNT).map((c) => c.id),
      cardOrder: cardsData.map((c) => c.id),
      maxColumns: DEFAULT_COLUMNS,
      showTooltips: true,
      showIcons: true,
    };
  }, [cardsData]);

  /* ---------------- Page Key ---------------- */

  const pageKey = useMemo(() => {
    if (!pathname) return "unknown-page";
    const segments = pathname.split("/").filter(Boolean);
    const key = (segments[0] === "dashboard" && segments[1]) 
      ? segments[1] 
      : (segments[segments.length - 1] || "overview");
    return `${key}-page`;
  }, [pathname]);

  /* ---------------- Route Icon ---------------- */

  const routeIconConfig = useMemo(() => {
    if (!pathname) return ROUTE_ICON_MAP.default;
    const segments = pathname.split("/").filter(Boolean);
    const key = (segments[0] === "dashboard" && segments[1])
        ? segments[1]
        : (segments[segments.length - 1] || "overview");
    return ROUTE_ICON_MAP[key] ?? ROUTE_ICON_MAP.default;
  }, [pathname]);

  /* ---------------- State ---------------- */

  const [settings, setSettings] = useState<SummarySettingsState>(() => getDefaultSettings());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ---------------- Load Preferences ---------------- */

  useEffect(() => {
    isMountedRef.current = true;
    if (!organizationId || !userId || !cardsData.length) return;

    const fetchPrefs = async () => {
      try {
        const params = new URLSearchParams({
          organizationId,
          personnelId: userId,
          key: PREF_KEY,
          target: pageKey,
          category: "LAYOUT",
        });
        if (branchId) params.append("branchId", branchId);

        const res = await fetch(`/api/preferences?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.preference && isMountedRef.current) {
          setSettings({ ...getDefaultSettings(), ...data.preference });
        }
      } catch {
        if (isMountedRef.current) setSettings(getDefaultSettings());
      } finally {
        if (isMountedRef.current) setPrefsLoaded(true);
      }
    };

    fetchPrefs();
    return () => { isMountedRef.current = false; };
  }, [organizationId, branchId, userId, pageKey, cardsData, getDefaultSettings]);

  /* ---------------- Debounced Save ---------------- */

  const savePreferences = useCallback((newState: SummarySettingsState) => {
      if (!organizationId || !userId) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: PREF_KEY, value: newState, scope: "USER", target: pageKey,
              organizationId, branchId: branchId ?? null, personnelId: userId, category: "LAYOUT",
            }),
          });
        } catch { console.error("Preference save failed"); }
      }, SAVE_DEBOUNCE_MS);
    }, [organizationId, branchId, userId, pageKey]
  );

  /* ---------------- Derived ---------------- */

  const columnCount = settings.maxColumns;
  const showSkeletons = loading || !prefsLoaded;

  const visibleCards = useMemo(() => {
    const map = new Map(cardsData.map((c) => [c.id, c]));
    return settings.cardOrder
      .map((id) => map.get(id))
      .filter((c): c is SummaryCard => !!c && settings.visibleCardIds.includes(c.id))
      .slice(0, columnCount);
  }, [settings.cardOrder, settings.visibleCardIds, columnCount, cardsData]);

  /* ---------------- UI ---------------- */

  return (
    <>
      <SummarySettingsModal
        pageKey={pageKey}
        open={settingsOpen}
        cardsData={cardsData}
        iconMap={ROUTE_ICON_MAP}
        initialState={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(newState) => {
          setSettings(newState);
          savePreferences(newState);
          setSettingsOpen(false);
        }}
      />

      <AnimatePresence mode="wait">
        {settings.showSummary ? (
          <motion.div 
            key="summary-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            /* Added py-4 to prevent hover transformations from being clipped */
            className="space-y-4 overflow-hidden py-4"
          >
            <div className="flex justify-between items-center px-2">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-gray-900 tracking-tight">Overview</span>
                <p className="text-[11px] text-gray-400 font-medium">Performance Metrics</p>
              </div>

              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center transition-all active:scale-95 shadow-sm group">
                    <i className="bx bx-dots-horizontal-rounded text-lg text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[160px] rounded-xl border border-gray-100 bg-white/95 backdrop-blur-md p-1 shadow-xl animate-in fade-in zoom-in-95"
                >
                  <DropdownMenu.Item
                    onSelect={() => setSettingsOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 hover:text-blue-600 rounded-lg outline-none transition-all"
                  >
                    <i className="bx bx-cog text-sm" /> Customize Layout
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => {
                      const newState = { ...settings, showSummary: false };
                      setSettings(newState);
                      savePreferences(newState);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-500 cursor-pointer hover:bg-red-50 rounded-lg outline-none transition-all"
                  >
                    <i className="bx bx-hide text-sm" /> Hide Summary
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>

            {/* Added px-2 to the grid container so cards don't touch the edges */}
            <div
              className="grid gap-4 px-2"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))` }}
            >
              <AnimatePresence mode="popLayout">
                {showSkeletons
                  ? Array.from({ length: columnCount }).map((_, i) => (
                      <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm animate-pulse h-[112px]" />
                    ))
                  : visibleCards.map((card, index) => {
                      const { icon, color, border } = routeIconConfig;
                      const isPositive = (card.change ?? 0) >= 0;

                      return (
                        <motion.div
                          key={card.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ 
                            duration: 0.2, 
                            delay: index * 0.03,
                            layout: { duration: 0.3 }
                          }}
                          whileHover={{ y: -4 }} /* Lift slightly higher for better visual feedback */
                          className="group relative bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden"
                        >
                          <div className="flex justify-between items-start gap-3 relative z-10">
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                {card.title}
                              </p>
                              <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight truncate">
                                {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                              </h3>
                            </div>

                            {settings.showIcons && (
                              <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center border ${border} ${color} transition-all duration-300 group-hover:scale-105`}>
                                <i className={`bx ${icon} text-lg`} />
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex items-center gap-2 relative z-10">
                            <div className={`flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                            }`}>
                                <i className={`bx ${isPositive ? 'bx-trending-up' : 'bx-trending-down'} mr-0.5`} />
                                {Math.abs(card.change ?? 0)}%
                            </div>
                            <span className="text-[10px] text-gray-400 font-medium">vs last month</span>
                          </div>
                        </motion.div>
                      );
                    })}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="summary-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-end p-2"
          >
            <button 
              onClick={() => {
                const newState = { ...settings, showSummary: true };
                setSettings(newState);
                savePreferences(newState);
              }}
              className="text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              <i className="bx bx-show text-sm" /> Show Summary
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}