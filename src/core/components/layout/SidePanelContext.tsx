"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
  useRef,
  startTransition,
} from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/* --------------------------------------------- */
/* Types & Constants */
/* --------------------------------------------- */

export interface PanelConfig {
  isOpen: boolean;
  isFullScreen: boolean;
  width: number;
}

export interface SidePanelContextType extends PanelConfig {
  content: ReactNode | null;
  title: string;
  isLoaded: boolean;
  openPanel: (content: ReactNode, title?: string) => void;
  openProvision: (data: any) => void;
  resetToDefault: () => void;
  closePanel: () => void;
  toggleLayout: () => void;
  toggleFullScreen: () => void;
  updateWidth: (width: number) => void;
  saveLayout: (currentConfig?: PanelConfig) => Promise<void>;
}

const PREF_KEY = "right-panel-config";
const SAVE_DEBOUNCE_MS = 800;
const MIN_WIDTH = 340;
const MAX_WIDTH = 340; // Cap width to 340

const DEFAULT_CONFIG: PanelConfig = {
  isOpen: false,
  isFullScreen: false,
  width: 340, 
};

const SidePanelContext = createContext<SidePanelContextType | undefined>(undefined);

/* --------------------------------------------- */
/* Provider */
/* --------------------------------------------- */

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const user = session?.user;

  /* ---------------- State ---------------- */

  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState("Workspace Schedule");
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

  /* ---------------- Page Key ---------------- */

  const pageKey = useMemo(() => {
    if (!pathname) return "unknown-page";
    const segments = pathname.split("/").filter(Boolean);
    return `${segments.at(-1) || "overview"}-panel`;
  }, [pathname]);

  /* --------------------------------------------- */
  /* Persistence Helper */
  /* --------------------------------------------- */

  const persistToDB = useCallback(async (data: PanelConfig) => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: user.organizationId,
          branchId: user.branchId,
          personnelId: user.id,
          scope: "USER",
          category: "LAYOUT",
          key: PREF_KEY,
          target: pageKey,
          value: JSON.stringify({
            isOpen: data.isOpen,
            width: data.width,
          }),
        }),
      });

      if (res.ok) {
        window.dispatchEvent(
          new CustomEvent("preference-update", {
            detail: { key: PREF_KEY, pageKey, isOpen: data.isOpen },
          })
        );
      }
    } catch (err) {
      console.error("Persistence Error:", err);
    }
  }, [user, pageKey]);

  const saveLayout = useCallback(async (explicit?: PanelConfig) => {
    const target = explicit || config;
    const serialized = JSON.stringify(target);

    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;

    localStorage.setItem(`masa-${pageKey}`, serialized);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      persistToDB(target);
    }, SAVE_DEBOUNCE_MS);
  }, [config, persistToDB, pageKey]);

  /* --------------------------------------------- */
  /* Sync Effect (URL & State Sync) */
  /* --------------------------------------------- */

  useEffect(() => {
    if (!isLoaded) return;

    // 1. Sync State to URL
    const params = new URLSearchParams(searchParams.toString());
    const isCurrentlyOpenInURL = params.get("panel") === "open";

    if (config.isOpen !== isCurrentlyOpenInURL) {
      if (config.isOpen) params.set("panel", "open");
      else params.delete("panel");

      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    }

    // 2. Sync State to DB/Local (Debounced)
    saveLayout(config);
  }, [config, isLoaded, router, searchParams, saveLayout]);

  /* --------------------------------------------- */
  /* Initialization (Local Storage & DB Fetch) */
  /* --------------------------------------------- */

  const fetchPreferences = useCallback(async () => {
    if (!user?.id) {
      setIsLoaded(true);
      return;
    }

    try {
      const params = new URLSearchParams({
        personnelId: user.id,
        category: "LAYOUT",
        key: PREF_KEY,
        target: pageKey,
      });

      const res = await fetch(`/api/preferences?${params}`);

      if (!res.ok) {
        console.warn(`Preferences API returned status: ${res.status}`);
        setIsLoaded(true);
        return;
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Preferences API did not return JSON. Check for redirects.");
        setIsLoaded(true);
        return;
      }

      const data = await res.json();

      if (data?.success && data.preference) {
        const parsed = typeof data.preference === "string" 
          ? JSON.parse(data.preference) 
          : data.preference;
        
        // Mobile Check: Prevent panel from opening by default on mobile DB fetch
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
          parsed.isOpen = false;
        }

        setConfig((prev) => ({ ...prev, ...parsed }));
      }
    } catch (err) {
      console.error("Fetch preferences failed:", err);
    } finally {
      setIsLoaded(true);
    }
  }, [user?.id, pageKey]);

  useEffect(() => {
    const saved = localStorage.getItem(`masa-${pageKey}`);
    const isMobile = window.innerWidth < 768;

    if (saved) {
      try {
        const parsedConfig = JSON.parse(saved);
        // Mobile Check: Override localStorage truthy value for isOpen
        if (isMobile) {
          setConfig({ ...parsedConfig, isOpen: false });
        } else {
          setConfig(parsedConfig);
        }
      } catch (e) {
        console.error("Failed to parse local storage config", e);
      }
    } else if (isMobile) {
      // Ensure mobile starts closed even without saved state
      setConfig((prev) => ({ ...prev, isOpen: false }));
    }
    
    fetchPreferences();
  }, [fetchPreferences, pageKey]);

  /* --------------------------------------------- */
  /* Actions */
  /* --------------------------------------------- */

  const resetToDefault = useCallback(() => {
    setContent(null);
    setTitle("Workspace Schedule");
  }, []);

  const openPanel = useCallback((node: ReactNode, newTitle?: string) => {
    // UX Enhancement: Scroll to top on mobile so the panel content is visible
    if (window.innerWidth < 768) {
      window.scrollTo(0, 0);
    }
    
    setContent(node);
    if (newTitle) setTitle(newTitle);
    setConfig((prev) => (prev.isOpen ? prev : { ...prev, isOpen: true }));
  }, []);

  const openProvision = useCallback((data: any) => {
    setTitle("Infrastructure Provisioning");
    setContent(
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node_Status: Provisioning</h4>
        </div>
        <p className="text-xs font-bold text-slate-600">
          Syncing resources for: <span className="text-slate-900">{data?.name || "Unknown Entity"}</span>
        </p>
      </div>
    );
    setConfig((prev) => ({ ...prev, isOpen: true }));
  }, []);

  const closePanel = useCallback(() => {
    setConfig((prev) => ({ ...prev, isOpen: false, isFullScreen: false }));
    // Wait for slide-out animation (300ms) before clearing content to prevent flashing
    setTimeout(() => {
      startTransition(() => {
        resetToDefault();
      });
    }, 300);
  }, [resetToDefault]);

  const toggleLayout = useCallback(() => {
    setConfig((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  const toggleFullScreen = useCallback(() => {
    setConfig((prev) => ({ ...prev, isFullScreen: !prev.isFullScreen }));
  }, []);

  const updateWidth = useCallback((width: number) => {
    const clamped = Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH);
    setConfig((prev) => (prev.width === clamped ? prev : { ...prev, width: clamped }));
  }, []);

  /* --------------------------------------------- */
  /* Context Value */
  /* --------------------------------------------- */

  const value = useMemo(() => ({
    ...config,
    content,
    title,
    isLoaded,
    openPanel,
    openProvision,
    resetToDefault,
    closePanel,
    toggleLayout,
    toggleFullScreen,
    updateWidth,
    saveLayout,
  }), [config, content, title, isLoaded, openPanel, openProvision, resetToDefault, closePanel, toggleLayout, toggleFullScreen, updateWidth, saveLayout]);

  // Keep children mounted to prevent fetch loops during re-renders
  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  );
}

export const useSidePanel = () => {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error("useSidePanel must be used within SidePanelProvider");
  return ctx;
};