"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useAlerts } from "@/src/core/components/feedback/AlertProvider";

const HUB_SETTINGS = [
  { key: "row_density", defaultValue: "standard" },
  { key: "table_font_size", defaultValue: "md" },
  { key: "table_wrap_cells", defaultValue: false },
  { key: "table_sticky_header", defaultValue: true },
  { key: "table_row_numbers", defaultValue: false },
  { key: "table_highlight_hover", defaultValue: true },
  { key: "table_group_dates", defaultValue: true },
  { key: "table_rows_per_page", defaultValue: 10 },
  { key: "table_tooltips", defaultValue: true },
] as const;

export function useDataTablePreference(tableId: string, initialColumnKeys: string[]) {
  const { data: session } = useSession();
  const { dispatch } = useAlerts();
  const pathname = usePathname();

  const pageKey = useMemo(() => {
    if (!pathname) return "unknown-page";
    const segments = pathname.split("/").filter(Boolean);
    let key = segments[segments.length - 1] || "overview";
    if (key.length > 20) key = key.slice(0, 20);
    return `${key}-page`;
  }, [pathname]);

  const preferenceKey = `columnOrder:${pageKey}`;

  const defaultTablePrefs = useMemo(() => {
    return HUB_SETTINGS.reduce((acc, s) => {
      acc[s.key] = s.defaultValue;
      return acc;
    }, {} as Record<string, unknown>);
  }, []);

  const [tablePrefs, setTablePrefs] = useState<Record<string, unknown>>(defaultTablePrefs);
  const [columnOrder, setColumnOrder] = useState<string[]>(initialColumnKeys);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();

    const loadPreferences = async () => {
      try {
        const orderRes = await fetch(
          `/api/preferences?category=TABLE&key=${preferenceKey}&target=${tableId}`,
          { signal: controller.signal }
        );
        if (orderRes.ok) {
          const json = await orderRes.json();
          if (Array.isArray(json.preference)) setColumnOrder(json.preference);
        }

        const prefsRes = await fetch(`/api/preferences?category=TABLE&all=true`, { cache: "no-store" });
        if (prefsRes.ok) {
          const json = await prefsRes.json();
          if (Array.isArray(json.preferences)) {
            const mapped = json.preferences.reduce((acc: Record<string, unknown>, p: { key: string; value: unknown }) => {
              acc[p.key] = p.value;
              return acc;
            }, {});
            setTablePrefs((prev) => ({ ...prev, ...mapped }));
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        dispatch({ kind: "TOAST", type: "ERROR", title: "Load Failed", message: "Could not load table preferences." });
      }
    };

    loadPreferences();
    return () => controller.abort();
  }, [session, tableId, preferenceKey, dispatch]);

  const saveColumnOrder = useCallback(
    (newOrder: string[]) => {
      setColumnOrder(newOrder);
      if (!session?.user) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scope: "USER",
              category: "TABLE",
              key: preferenceKey,
              target: tableId,
              value: newOrder,
              // Note: Ensure your session object types align with these properties
              organizationId: (session.user as Record<string, unknown>).organizationId,
              branchId: (session.user as Record<string, unknown>).branchId,
              personnelId: session.user.id,
            }),
          });
        } catch (error) {
          dispatch({ kind: "TOAST", type: "ERROR", title: "Save Failed", message: "Could not save column order." });
        }
      }, 600);
    },
    [preferenceKey, tableId, session, dispatch]
  );

  return { tablePrefs, columnOrder, saveColumnOrder };
}