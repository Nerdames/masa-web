"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "framer-motion";
import SummarySettingsModal, {
  SummarySettingsState,
} from "@/components/modal/SummarySettingsModal";

/* ---------------- Constants ---------------- */

const PREF_KEY = "summary";
const DEFAULT_COLUMNS = 4;
const DEFAULT_VISIBLE_COUNT = 4;
const SAVE_DEBOUNCE_MS = 600;

/* ---------------- Route Icon Map ---------------- */

const ROUTE_ICON_MAP: Record<string, { icon: string; color: string }> = {
  sales: { icon: "bx-chart", color: "bg-blue-100 text-blue-600" },
  customers: { icon: "bx-user", color: "bg-pink-100 text-pink-600" },
  invoices: { icon: "bx-receipt", color: "bg-purple-100 text-purple-600" },
  orders: { icon: "bx-cart", color: "bg-green-100 text-green-600" },
  inventory: { icon: "bx-box", color: "bg-yellow-100 text-yellow-600" },
  stock: { icon: "bx-bar-chart", color: "bg-green-100 text-green-600" },
  notifications: { icon: "bx-bell", color: "bg-red-100 text-red-600" },
  overview: { icon: "bx-doughnut-chart", color: "bg-teal-100 text-teal-600" },
  settings: { icon: "bx-cog", color: "bg-gray-100 text-gray-600" },
  profile: { icon: "bx-user", color: "bg-indigo-100 text-indigo-600" },
  default: { icon: "bx-card", color: "bg-gray-100 text-gray-500" },
};

/* ---------------- Types ---------------- */

export type SummaryCard = {
  id: string;
  title: string;
  value: number | string;
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
      visibleCardIds: cardsData
        .slice(0, DEFAULT_VISIBLE_COUNT)
        .map((c) => c.id),
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
    if (segments[0] === "dashboard" && segments[1]) {
      return `${segments[1]}-page`;
    }
    return `${segments[segments.length - 1]}-page`;
  }, [pathname]);

  /* ---------------- Route Icon ---------------- */

  const routeIconConfig = useMemo(() => {
    if (!pathname) return ROUTE_ICON_MAP.default;
    const segments = pathname.split("/").filter(Boolean);
    const key =
      segments[0] === "dashboard" && segments[1]
        ? segments[1]
        : segments[segments.length - 1];
    return ROUTE_ICON_MAP[key] ?? ROUTE_ICON_MAP.default;
  }, [pathname]);

  /* ---------------- State ---------------- */

  const [settings, setSettings] = useState<SummarySettingsState>(() =>
    getDefaultSettings()
  );

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ---------------- Load Preferences ---------------- */

  useEffect(() => {
    isMountedRef.current = true;

    if (!organizationId || !userId || !cardsData.length) return;

    const fetchPrefs = async () => {
      try {
        const res = await fetch(
          `/api/preferences?organizationId=${organizationId}&branchId=${
            branchId ?? ""
          }&personnelId=${userId}&scope=USER&key=${PREF_KEY}&target=${pageKey}`
        );

        if (!res.ok) throw new Error("Fetch failed");

        const data = await res.json();

        if (data.success && data.preference) {
          if (isMountedRef.current) {
            setSettings(data.preference);
          }
        } else {
          if (isMountedRef.current) {
            setSettings(getDefaultSettings());
          }
        }
      } catch {
        if (isMountedRef.current) {
          setSettings(getDefaultSettings());
        }
      } finally {
        if (isMountedRef.current) {
          setPrefsLoaded(true);
        }
      }
    };

    fetchPrefs();

    return () => {
      isMountedRef.current = false;
    };
  }, [
    organizationId,
    branchId,
    userId,
    pageKey,
    cardsData,
    getDefaultSettings,
  ]);

  /* ---------------- Debounced Save ---------------- */

  const savePreferences = useCallback(
    (newState: SummarySettingsState) => {
      if (!organizationId || !userId) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: PREF_KEY,
              value: newState,
              scope: "USER",
              target: pageKey,
              organizationId,
              branchId: branchId ?? null,
              personnelId: userId,
              category: "LAYOUT",
            }),
          });
        } catch {
          console.error("Preference save failed");
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [organizationId, branchId, userId, pageKey]
  );

  /* ---------------- Derived ---------------- */

  const columnCount = settings.maxColumns;
  const showSkeletons = loading || !prefsLoaded;

  const orderedCards = useMemo(() => {
    const map = new Map(cardsData.map((c) => [c.id, c]));
    return settings.cardOrder
      .map((id) => map.get(id))
      .filter(Boolean) as SummaryCard[];
  }, [settings.cardOrder, cardsData]);

  const visibleCards = useMemo(() => {
    return orderedCards
      .filter((c) => settings.visibleCardIds.includes(c.id))
      .slice(0, columnCount);
  }, [orderedCards, settings.visibleCardIds, columnCount]);

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
          setSettings(newState);      // ✅ Optimistic update
          savePreferences(newState);  // ✅ Debounced save
          setSettingsOpen(false);
        }}
      />

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-900">
            Overview
          </span>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="w-9 h-9 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center">
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

        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))` }}
        >
          {showSkeletons
            ? Array.from({ length: columnCount }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white p-6 rounded-xl shadow animate-pulse h-24"
                />
              ))
            : visibleCards.map((card) => {
                const { icon, color } = routeIconConfig;

                return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white p-6 rounded-xl shadow"
                  >
                    <div className="flex justify-between">
                      <div>
                        <p className="text-gray-500 text-sm">{card.title}</p>
                        <p className="text-2xl font-bold">{card.value}</p>
                      </div>

                      {settings.showIcons && (
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}
                        >
                          <i className={`bx ${icon} text-xl`} />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
        </div>
      </div>
    </>
  );
}