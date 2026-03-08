"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/feedback/ToastProvider";

export interface DataTablePrefs {
  row_density: "compact" | "standard";
  table_font_size: "sm" | "md" | "lg";
  table_wrap_cells: boolean;
}

export interface DataTablePreferenceOptions {
  tableId: string;
  columnKeys: string[];
  defaultTooltipPrefs?: Record<string, boolean>;
  defaultTablePrefs?: Partial<DataTablePrefs>;
  debounceMs?: number;
}

/**
 * Hook to manage table-specific preferences: column order, tooltips, and general table prefs
 */
export function useDataTablePreference({
  tableId,
  columnKeys,
  defaultTooltipPrefs = {},
  defaultTablePrefs,
  debounceMs = 600,
}: DataTablePreferenceOptions) {
  const { data: session } = useSession();
  const { addToast } = useToast();

  // Column order
  const [columnOrder, setColumnOrder] = useState<string[]>([...columnKeys]);
  const [tooltipPrefs, setTooltipPrefs] = useState<Record<string, boolean>>({ ...defaultTooltipPrefs });
  const [tablePrefs, setTablePrefs] = useState<DataTablePrefs>({
    row_density: "standard",
    table_font_size: "md",
    table_wrap_cells: false,
    ...defaultTablePrefs,
  });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferenceColumnKey = `columnOrder:${tableId}`;
  const preferenceTooltipKey = `tooltipPrefs:${tableId}`;

  /* ================= Load Preferences ================= */
  const loadPreferences = useCallback(async () => {
    if (!session?.user) return;

    try {
      // Column order
      const colRes = await fetch(`/api/preferences?category=TABLE&key=${preferenceColumnKey}&target=${tableId}`, { cache: "no-store" });
      if (colRes.ok) {
        const colJson: any = await colRes.json();
        if (Array.isArray(colJson.preference)) {
          const validOrder = colJson.preference.filter((k: string) => columnKeys.includes(k));
          setColumnOrder([...validOrder, ...columnKeys.filter(k => !validOrder.includes(k))]);
        }
      }

      // Tooltip preferences
      const tipRes = await fetch(`/api/preferences?category=TABLE&key=${preferenceTooltipKey}&target=${tableId}`, { cache: "no-store" });
      if (tipRes.ok) {
        const tipJson: any = await tipRes.json();
        if (tipJson.preference && typeof tipJson.preference === "object") {
          setTooltipPrefs(tipJson.preference);
        }
      }

      // Table prefs
      const tableRes = await fetch(`/api/preferences?category=TABLE&key=tablePrefs&target=${tableId}`, { cache: "no-store" });
      if (tableRes.ok) {
        const tableJson: any = await tableRes.json();
        if (tableJson.preference && typeof tableJson.preference === "object") {
          setTablePrefs(prev => ({ ...prev, ...tableJson.preference }));
        }
      }
    } catch (error) {
      // optional: addToast({ type: "error", title: "Load Failed", message: "Could not load table preferences" });
    }
  }, [tableId, preferenceColumnKey, preferenceTooltipKey, columnKeys, session]);

  /* ================= Save Preferences ================= */
  const savePreferences = useCallback(
    (newColumnOrder?: string[], newTooltipPrefs?: Record<string, boolean>, newTablePrefs?: Partial<DataTablePrefs>) => {
      if (!session?.user) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const requests: Promise<any>[] = [];

          if (newColumnOrder) {
            requests.push(
              fetch("/api/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  key: preferenceColumnKey,
                  target: tableId,
                  category: "TABLE",
                  value: newColumnOrder,
                  scope: "USER",
                  organizationId: session.user.organizationId,
                  branchId: session.user.branchId,
                  personnelId: session.user.id,
                }),
              })
            );
          }

          if (newTooltipPrefs) {
            requests.push(
              fetch("/api/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  key: preferenceTooltipKey,
                  target: tableId,
                  category: "TABLE",
                  value: newTooltipPrefs,
                  scope: "USER",
                  organizationId: session.user.organizationId,
                  branchId: session.user.branchId,
                  personnelId: session.user.id,
                }),
              })
            );
          }

          if (newTablePrefs) {
            requests.push(
              fetch("/api/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  key: "tablePrefs",
                  target: tableId,
                  category: "TABLE",
                  value: newTablePrefs,
                  scope: "USER",
                  organizationId: session.user.organizationId,
                  branchId: session.user.branchId,
                  personnelId: session.user.id,
                }),
              })
            );
          }

          await Promise.all(requests);
          window.dispatchEvent(new Event("preference-update"));
        } catch {
          addToast?.({ type: "error", title: "Save Failed", message: "Could not save table preferences" });
        }
      }, debounceMs);
    },
    [session, tableId, preferenceColumnKey, preferenceTooltipKey, debounceMs, addToast]
  );

  /* ================= Listen for global updates ================= */
  useEffect(() => {
    loadPreferences();
    const handler = () => loadPreferences();
    window.addEventListener("preference-update", handler);
    return () => {
      window.removeEventListener("preference-update", handler);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [loadPreferences]);

  return {
    columnOrder,
    setColumnOrder: (newOrder: string[]) => {
      setColumnOrder(newOrder);
      savePreferences(newOrder, undefined, undefined);
    },
    tooltipPrefs,
    setTooltipPrefs: (prefs: Record<string, boolean>) => {
      setTooltipPrefs(prefs);
      savePreferences(undefined, prefs, undefined);
    },
    tablePrefs,
    setTablePrefs: (prefs: Partial<DataTablePrefs>) => {
      setTablePrefs(prev => ({ ...prev, ...prefs }));
      savePreferences(undefined, undefined, prefs);
    },
    reload: loadPreferences,
  };
}