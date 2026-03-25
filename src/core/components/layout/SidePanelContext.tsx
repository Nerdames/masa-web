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
} from "react";
import { useSession } from "next-auth/react";

/* --------------------------------------------- */
/* Types */
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
  saveLayout: (currentConfig?: PanelConfig) => Promise<void>;
}

const DEFAULT_CONFIG: PanelConfig = {
  isOpen: true, // Display by default as requested
  isFullScreen: false,
  width: 420, 
};

const SidePanelContext = createContext<SidePanelContextType | undefined>(undefined);

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user;

  const [content, setContent] = useState<ReactNode | null>(null);
  const [title, setTitle] = useState<string>("Workspace Schedule");
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);
  const [mounted, setMounted] = useState(false);

  // Ref tracking to prevent stale state in async saveLayout
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  /* --- Persistence Logic --- */

  const persistToDB = useCallback(async (data: PanelConfig) => {
    if (!user?.organizationId || !user?.branchId || !user?.id) return;
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: user.organizationId,
          branchId: user.branchId,
          personnelId: user.id,
          scope: "USER",
          category: "LAYOUT",
          key: "right-panel-config",
          value: JSON.stringify({ isOpen: data.isOpen, width: data.width }),
          target: "", // Aligned with Sidebar pattern
        }),
      });
    } catch (err) {
      console.error("SidePanel Persistence Error:", err);
    }
  }, [user?.id, user?.organizationId, user?.branchId]);

  const saveLayout = useCallback(async (explicitConfig?: PanelConfig) => {
    const targetConfig = explicitConfig || configRef.current;
    localStorage.setItem("masa-right-panel", JSON.stringify(targetConfig));
    await persistToDB(targetConfig);
  }, [persistToDB]);

  /* --- Initialization --- */

  useEffect(() => {
    setMounted(true);
    
    // 1. Immediate Local Sync (to prevent flicker)
    const saved = localStorage.getItem("masa-right-panel");
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.warn("Malformed local storage config, falling back to default open.");
      }
    }

    // 2. Database Sync (Authority source)
    const fetchPreference = async () => {
      if (!user?.organizationId || !user?.branchId || !user?.id) return;
      
      try {
        const params = new URLSearchParams({
          organizationId: user.organizationId,
          branchId: user.branchId,
          personnelId: user.id,
          category: "LAYOUT",
          key: "right-panel-config",
          target: "", // Aligned with Sidebar pattern
        });

        const res = await fetch(`/api/preferences?${params.toString()}`);
        const data = await res.json();

        if (data.success && data.preference) {
          const parsed = typeof data.preference === 'string' 
            ? JSON.parse(data.preference) 
            : data.preference;
          
          const updatedConfig = { ...DEFAULT_CONFIG, ...parsed };
          setConfig(updatedConfig);
          localStorage.setItem("masa-right-panel", JSON.stringify(updatedConfig));
        }
      } catch (err) {
        console.error("Failed to fetch panel preferences:", err);
      }
    };

    fetchPreference();
  }, [user]); // Changed dependency to watch the full user object, mirroring the Sidebar

  /* --- Actions --- */

  const resetToDefault = useCallback(() => {
    setContent(null);
    setTitle("Workspace Schedule");
  }, []);

  const openPanel = useCallback((newContent: ReactNode, newTitle?: string) => {
    setContent(newContent);
    if (newTitle) setTitle(newTitle);
    
    setConfig((prev) => {
      const next = { ...prev, isOpen: true };
      if (prev.isOpen) return prev; 
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const openProvision = useCallback((data: any) => {
    setTitle("Infrastructure Provisioning");
    setContent(
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node_Status: Provisioning</h4>
        </div>
        <p className="text-xs font-bold text-slate-600">Syncing resources for: <span className="text-slate-900">{data?.name || 'Unknown Entity'}</span></p>
      </div>
    );
    
    setConfig((prev) => {
      const next = { ...prev, isOpen: true };
      if (prev.isOpen) return prev;
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const closePanel = useCallback(() => {
    setConfig((prev) => {
      if (!prev.isOpen && !prev.isFullScreen) return prev; 
      const next = { ...prev, isOpen: false, isFullScreen: false };
      saveLayout(next);
      return next;
    });
    
    setTimeout(() => {
      resetToDefault();
    }, 300);
  }, [saveLayout, resetToDefault]);

  const toggleLayout = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, isOpen: !prev.isOpen };
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const toggleFullScreen = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, isFullScreen: !prev.isFullScreen };
      saveLayout(next);
      return next;
    });
  }, [saveLayout]);

  const updateWidth = useCallback((newWidth: number) => {
    setConfig((prev) => {
      const next = { ...prev, width: newWidth };
      localStorage.setItem("masa-right-panel", JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
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
    saveLayout,
  }), [config, content, title, openPanel, openProvision, resetToDefault, closePanel, toggleLayout, toggleFullScreen, updateWidth, saveLayout]);

  // Prevent hydration mismatch by rendering invisible wrapper until mounted
  return (
    <SidePanelContext.Provider value={value}>
      <div style={{ visibility: mounted ? "visible" : "hidden" }}>
        {children}
      </div>
    </SidePanelContext.Provider>
  );
}

export const useSidePanel = () => {
  const context = useContext(SidePanelContext);
  if (!context) {
    throw new Error("useSidePanel must be used within a SidePanelProvider");
  }
  return context;
};