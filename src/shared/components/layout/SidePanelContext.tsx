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

export interface ProvisioningData {
  name?: string;
  [key: string]: unknown; // Allows for additional properties while remaining type-safe
}

export interface PanelConfig {
  isOpen: boolean;
  isFullScreen: boolean;
  width: number;
}

export interface SidePanelContextType extends PanelConfig {
  content: ReactNode | null;
  title: string;
  openPanel: (content: ReactNode, title?: string) => void;
  openProvision: (data: ProvisioningData) => void;
  resetToDefault: () => void;
  closePanel: () => void;
  toggleLayout: () => void;
  toggleFullScreen: () => void;
  updateWidth: (width: number) => void;
}

const MIN_WIDTH = 340;
const MAX_WIDTH = 340;

// Updated DEFAULT_CONFIG to reflect the new full-screen requirement
const DEFAULT_CONFIG: PanelConfig = {
  isOpen: false,
  isFullScreen: true, // Defaulting to true for next open action
  width: 340,
};

/* Unified internal state representation for stack architecture */
interface PanelSnapshot {
  content: ReactNode | null;
  title: string;
  config: PanelConfig;
}

interface SidePanelState extends PanelSnapshot {
  history: Array<PanelSnapshot>;
}

const SidePanelContext = createContext<SidePanelContextType | undefined>(
  undefined
);

/* --------------------------------------------- */
/* Provider */
/* --------------------------------------------- */

export function SidePanelProvider({ children }: { children: ReactNode }) {
  /* ---------------- State ---------------- */

  const [state, setState] = useState<SidePanelState>({
    content: null,
    title: "Workspace Schedule",
    config: DEFAULT_CONFIG,
    history: [],
  });

  /* --------------------------------------------- */
  /* Actions */
  /* --------------------------------------------- */

  const resetToDefault = useCallback(() => {
    setState((prev) => ({
      ...prev,
      content: null,
      title: "Workspace Schedule",
      history: [],
    }));
  }, []);

  const openPanel = useCallback((node: ReactNode, newTitle?: string) => {
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;

    if (!isDesktop && typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }

    setState((prev) => {
      const nextHistory = [...prev.history];
      
      // If a panel is currently open with content, preserve it in the history stack
      if (prev.config.isOpen && prev.content) {
        nextHistory.push({
          content: prev.content,
          title: prev.title,
          config: prev.config,
        });
      }

      return {
        ...prev,
        content: node,
        title: newTitle ?? prev.title,
        history: nextHistory,
        config: {
          ...prev.config,
          isOpen: true,
          // Force full screen on desktop open, otherwise maintain previous/default state
          isFullScreen: isDesktop ? true : prev.config.isFullScreen,
        },
      };
    });
  }, []);

  const openProvision = useCallback((data: ProvisioningData) => {
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;

    const provisionTitle = "Infrastructure Provisioning";
    const provisionContent = (
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

    setState((prev) => {
      const nextHistory = [...prev.history];
      
      // Save current active state to historical layer before displaying presentation layer
      if (prev.config.isOpen && prev.content) {
        nextHistory.push({
          content: prev.content,
          title: prev.title,
          config: prev.config,
        });
      }

      return {
        ...prev,
        content: provisionContent,
        title: provisionTitle,
        history: nextHistory,
        config: {
          ...prev.config,
          isOpen: true,
          isFullScreen: isDesktop ? true : prev.config.isFullScreen,
        },
      };
    });
  }, []);

  const closePanel = useCallback(() => {
    let shouldTriggerCloseAnimation = false;

    setState((prev) => {
      // Overlay Logic: If there's an underlying panel in historical stack, revert to it
      if (prev.history.length > 0) {
        const nextHistory = [...prev.history];
        const previousPanel = nextHistory.pop()!;

        return {
          ...prev,
          content: previousPanel.content,
          title: previousPanel.title,
          config: previousPanel.config,
          history: nextHistory,
        };
      }

      // Base Case: If history is empty, close the viewport panel completely
      shouldTriggerCloseAnimation = true;
      return {
        ...prev,
        config: { ...prev.config, isOpen: false, isFullScreen: false },
      };
    });

    // Clean execution of side-effects deferred outside the synchronous React state cycle
    if (shouldTriggerCloseAnimation) {
      setTimeout(() => {
        startTransition(() => {
          resetToDefault();
        });
      }, 300);
    }
  }, [resetToDefault]);

  const toggleLayout = useCallback(() => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, isOpen: !prev.config.isOpen },
    }));
  }, []);

  const toggleFullScreen = useCallback(() => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, isFullScreen: !prev.config.isFullScreen },
    }));
  }, []);

  const updateWidth = useCallback((width: number) => {
    const clamped = Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH);
    setState((prev) =>
      prev.config.width === clamped
        ? prev
        : { ...prev, config: { ...prev.config, width: clamped } }
    );
  }, []);

  /* --------------------------------------------- */
  /* Context Value */
  /* --------------------------------------------- */

  const value = useMemo(
    () => ({
      ...state.config,
      content: state.content,
      title: state.title,
      openPanel,
      openProvision,
      resetToDefault,
      closePanel,
      toggleLayout,
      toggleFullScreen,
      updateWidth,
    }),
    [
      state.config,
      state.content,
      state.title,
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