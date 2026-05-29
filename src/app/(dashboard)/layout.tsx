"use client";

import { ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import TopBar from "@/core/components/layout/TopBar";
import Sidebar from "@/core/components/layout/Sidebar";
import { SidePanelProvider, useSidePanel } from "@/core/components/layout/SidePanelContext";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: DashboardRootLayoutProps) {
  const { status } = useSession({ required: true });

  return (
    <SidePanelProvider>
      <div className="h-screen w-full relative overflow-hidden flex flex-col bg-slate-50 text-slate-900">
        
        {/* Background Decorative Element */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <svg className="absolute -left-20 -top-20 opacity-40" viewBox="0 0 600 600" style={{ width: "min(45vw, 450px)" }}>
            <circle cx="300" cy="300" r="260" className="fill-slate-100/50" />
          </svg>
        </div>

        {/* Global Header */}
        <header className="flex-none relative z-[1000] border-b border-slate-200 bg-white/80 backdrop-blur-md">
          <TopBar />
          {status === "loading" && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
              <div className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-500 animate-progress-slide w-full" />
            </div>
          )}
        </header>

        {/* Workspace Canvas */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
          {/* Sidebar - Persistent on the left */}
          <Sidebar />

          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">
            <main className={`flex-1 flex flex-col min-w-0 min-h-0 transition-opacity duration-300 ${status === "loading" ? "opacity-0" : "opacity-100"}`}>
              {children}
            </main>

            <DynamicSidePanel />
          </div>
        </div>

        <style jsx global>{`
          html, body { 
            height: 100%; 
            overflow: hidden !important; 
          }
          @keyframes progress-slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-progress-slide {
            animation: progress-slide 1.5s infinite linear;
          }
        `}</style>
      </div>
    </SidePanelProvider>
  );
}

/* ==========================================================================
   DYNAMIC SIDE PANEL COMPONENT
   ========================================================================== */

function DynamicSidePanel() {
  const { isOpen, content, width, isFullScreen, closePanel } = useSidePanel();
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsOverlayMode(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!mounted) return null;

  const shouldShow = isOpen && !!content;

  const getPanelStyles = () => {
    if (isFullScreen) {
      return {
        width: isOverlayMode ? "100%" : "90%",
        maxWidth: isOverlayMode ? "none" : "1200px",
        height: isOverlayMode ? "100%" : "92%",
        top: isOverlayMode ? "0" : "4%",
        right: isOverlayMode ? "0" : "5%",
        borderRadius: isOverlayMode ? "0" : "12px",
        position: "absolute" as const,
        zIndex: 100,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      };
    }

    return {
      width: `${Math.min(width, 300)}px`,
      position: isOverlayMode ? ("absolute" as const) : ("relative" as const),
      right: 0,
      top: 0,
      height: "100%",
    };
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <>
          {isFullScreen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[45]"
            />
          )}

          <motion.aside
            key="side-panel"
            initial={isFullScreen ? { opacity: 0, scale: 0.98, y: 12 } : { x: "100%", opacity: 0 }}
            animate={isFullScreen ? { opacity: 1, scale: 1, y: 0 } : { x: 0, opacity: 1 }}
            exit={isFullScreen ? { opacity: 0, scale: 0.98, y: 12 } : { x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className={`
              min-h-0 max-w-full shrink-0 overflow-hidden flex flex-col z-[50] transition-all duration-300
              bg-white border-l border-slate-200 ${!isFullScreen && "backdrop-blur-xl"}
            `}
            style={getPanelStyles()}
          >
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <div className="h-full animate-in fade-in slide-in-from-right-4 duration-200">
                {content}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}