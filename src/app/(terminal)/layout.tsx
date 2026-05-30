"use client";

import { ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import TopBar from "@/shared/components/layout/TopBar";
import Sidebar from "@/shared/components/layout/Sidebar";
import { SidePanelProvider, useSidePanel } from "@/shared/components/layout/SidePanelContext";
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


function DynamicSidePanel({ isDark }: { isDark: boolean }) {
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
        width: isOverlayMode ? "100%" : "95%",
        maxWidth: isOverlayMode ? "none" : "1400px",
        height: isOverlayMode ? "100%" : "95%",
        top: isOverlayMode ? "0" : "2.5%",
        right: isOverlayMode ? "0" : "2.5%",
        borderRadius: isOverlayMode ? "0" : "16px",
        position: "absolute" as const,
        zIndex: 100,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      };
    }

    return {
      width: `${Math.min(width, 340)}px`,
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
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[45]"
            />
          )}

          <motion.aside
            key="side-panel"
            initial={isFullScreen ? { opacity: 0, scale: 0.95, y: 20 } : { x: "100%", opacity: 0 }}
            animate={isFullScreen ? { opacity: 1, scale: 1, y: 0 } : { x: 0, opacity: 1 }}
            exit={isFullScreen ? { opacity: 0, scale: 0.95, y: 20 } : { x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`
              min-h-0 max-w-full shrink-0 overflow-hidden flex flex-col z-[50] transition-all duration-300
              ${isDark ? "bg-slate-900/95 border-l border-slate-800" : "bg-white/95 border-l border-black/5"}
              ${!isFullScreen && "backdrop-blur-xl"}
            `}
            style={getPanelStyles()}
          >
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <div className="h-full animate-in fade-in slide-in-from-right-4 duration-300">
                {content}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}