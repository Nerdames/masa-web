"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
  startTransition,
} from "react";

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
  openPanel: (content: ReactNode, title?: string) => void;
  openProvision: (data: any) => void;
  resetToDefault: () => void;
  closePanel: () => void;
  toggleLayout: () => void;
  toggleFullScreen: () => void;
  updateWidth: (width: number) => void;
}

const MIN_WIDTH = 340;
const MAX_WIDTH = 340; // Cap width to 340 as per original logic

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
  /* ---------------- State ---------------- */

  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState("Workspace Schedule");
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);

  /* --------------------------------------------- */
  /* Actions */
  /* --------------------------------------------- */

  const resetToDefault = useCallback(() => {
    setContent(null);
    setTitle("Workspace Schedule");
  }, []);

  const openPanel = useCallback((node: ReactNode, newTitle?: string) => {
    // UX Enhancement: Scroll to top on mobile so the panel content is visible
    if (typeof window !== "undefined" && window.innerWidth < 768) {
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
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Node_Status: Provisioning
          </h4>
        </div>
        <p className="text-xs font-bold text-slate-600">
          Syncing resources for:{" "}
          <span className="text-slate-900">{data?.name || "Unknown Entity"}</span>
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

  const value = useMemo(
    () => ({
      ...config,
      content,
      title,
      openPanel,
      openProvision,
      resetToDefault,
      closePanel,
      toggleLayout,
      toggleFullScreen,
      updateWidth,
    }),
    [
      config,
      content,
      title,
      openPanel,
      openProvision,
      resetToDefault,
      closePanel,
      toggleLayout,
      toggleFullScreen,
      updateWidth,
    ]
  );

  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  );
}

/* --------------------------------------------- */
/* Hook */
/* --------------------------------------------- */

export const useSidePanel = () => {
  const ctx = useContext(SidePanelContext);
  if (!ctx) {
    throw new Error("useSidePanel must be used within SidePanelProvider");
  }
  return ctx;
};