"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import TopBar from "@/core/components/layout/TopBar";
import { SidePanelProvider, useSidePanel } from "@/core/components/layout/SidePanelContext";
import { cn } from "@/core/utils";
import { motion, AnimatePresence } from "framer-motion";

/* --------------------------------------------- */
/* Constants */
/* --------------------------------------------- */
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 900;

/* --------------------------------------------- */
/* Side Panel UI Component */
/* --------------------------------------------- */
function SidePanelUI() {
  const { 
    isOpen, 
    isFullScreen, 
    width, 
    content, 
    title,
    closePanel, 
    toggleFullScreen, 
    updateWidth, 
    saveLayout 
  } = useSidePanel();

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Resize Logic
  const startResizing = useCallback((e: React.MouseEvent) => {
    if (isFullScreen) return;
    e.preventDefault();
    setIsResizing(true);
  }, [isFullScreen]);

  const stopResizing = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      saveLayout(); // Persist width to DB on release
    }
  }, [isResizing, saveLayout]);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
        updateWidth(newWidth);
      }
    }
  }, [isResizing, updateWidth]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  return (
    <>
      {/* 1. Show Icon (When Collapsed) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            onClick={() => {/* Handled by TopBar toggle or custom open logic */}}
            className="fixed bottom-12 right-0 z-40 h-10 w-8 bg-slate-900 text-white flex items-center justify-center rounded-l-md border border-slate-700 shadow-lg hover:w-10 transition-all group"
          >
            <i className="bx bx-chevron-left text-xl group-hover:scale-110" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* 2. The Panel */}
      <aside
        ref={panelRef}
        style={{ width: isFullScreen ? "100vw" : isOpen ? `${width}px` : "0px" }}
        className={cn(
          "h-full bg-white flex flex-col transition-[width] duration-300 ease-in-out relative border-l border-slate-200 z-[60]",
          isFullScreen ? "fixed inset-0 border-l-0" : "relative shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)]",
          !isOpen && "border-none"
        )}
      >
        {/* Resize Handle (Invisible but wide hit area) */}
        {isOpen && !isFullScreen && (
          <div
            onMouseDown={startResizing}
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-[70] hover:bg-blue-500/30 transition-colors"
          />
        )}

        <div className="flex flex-col h-full overflow-hidden">
          {/* Panel Header */}
          <div className="h-12 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 truncate">
                {title || "Utility Engine"}
              </span>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={toggleFullScreen}
                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition-colors"
                title="Toggle Full Screen"
              >
                <i className={cn("bx text-lg", isFullScreen ? "bx-exit-fullscreen" : "bx-fullscreen")} />
              </button>
              <button 
                onClick={closePanel}
                className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"
              >
                <i className="bx bx-x text-xl" />
              </button>
            </div>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
            {isOpen && content}
          </div>
        </div>
      </aside>

      {/* 3. Dragging Mask (Prevents iframe/text selection issues while resizing) */}
      {isResizing && <div className="fixed inset-0 z-[100] cursor-col-resize" />}
    </>
  );
}

/* --------------------------------------------- */
/* Main Layout Wrapper */
/* --------------------------------------------- */
export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidePanelProvider>
      <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden font-sans select-none">
        <TopBar />

        <div className="flex-1 relative flex overflow-hidden">
          {/* Main Operational Canvas */}
          {/* We use a motion div to slightly dim/scale the main content when panel is full screen */}
          <main 
            className={cn(
              "flex-1 overflow-hidden relative transition-all duration-500",
              // Logic: If panel is open and full screen, we can keep main mounted but invisible to prevent re-renders
              "data-[panel-full=true]:opacity-0 data-[panel-full=true]:pointer-events-none"
            )}
            // Use a custom data attribute for clean CSS targeting
          >
            {children}
          </main>

          <SidePanelUI />
        </div>

        {/* Operational Status Footer */}
        <footer className="h-7 bg-slate-900 flex items-center justify-between px-4 text-[9px] text-slate-500 font-bold tracking-widest uppercase border-t border-white/5">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
              Fortress Secured
            </span>
            <span className="text-slate-800">|</span>
            <span className="text-slate-400">System v2.0-Fortress</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Sync:</span>
              <span className="text-slate-300">Live</span>
            </div>
            <div className="flex items-center gap-2">
              <i className="bx bx-hdd text-slate-600" />
              <span className="text-slate-300 text-[8px]">Sector-7G</span>
            </div>
          </div>
        </footer>
      </div>
    </SidePanelProvider>
  );
}