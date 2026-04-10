"use client";

import { ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import TopBar from "@/core/components/layout/TopBar";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";
import { SidePanelProvider, useSidePanel } from "@/core/components/layout/SidePanelContext";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: DashboardRootLayoutProps) {
  const { status } = useSession({ required: true });
  const [isDark, setIsDark] = useState(false);
  usePusherNotifications();

  /**
   * Time-Aware Theme logic (Syncs with Operations Hub)
   * Automatically engages eye-protection from 19:00 - 07:00
   */
  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    handleTheme();
    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <SidePanelProvider>
      {/* 1. ROOT CONTAINER - Theme aware with full-width layout */}
      <div className={`h-screen w-full relative overflow-hidden flex flex-col transition-colors duration-1000 
        ${isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"}`}>
        
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <svg className={`absolute -left-20 -top-20 ${isDark ? "opacity-[0.03]" : "opacity-10"}`} viewBox="0 0 600 600" style={{ width: "min(45vw, 450px)" }}>
            <defs>
              <linearGradient id="gA" x1="0" x2="1">
                <stop offset="0" stopColor="#463aed" />
                <stop offset="1" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            <circle cx="300" cy="300" r="260" fill="url(#gA)" />
          </svg>
        </div>

        {/* 2. TOPBAR */}
        <header className={`flex-none relative z-[1000] border-b backdrop-blur-md transition-colors
          ${isDark ? "bg-slate-900/50 border-slate-800" : "bg-white/80 border-black/5"}`}>
          <TopBar />
          {status === "loading" && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
              <div className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-500 animate-progress-slide w-full" />
            </div>
          )}
        </header>

        {/* 3. FULL-WIDTH VIEWPORT WRAPPER */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">
            <main className={`flex-1 flex flex-col min-w-0 min-h-0 transition-opacity duration-300 ${status === "loading" ? "opacity-0" : "opacity-100"}`}>
               {children}
            </main>

            {/* The Integrated Utility SidePanel - Now closes by default if no content is present */}
            <DynamicSidePanel isDark={isDark} />
          </div>
        </div>

        {/* Global Styles */}
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
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </div>
    </SidePanelProvider>
  );
}

function DynamicSidePanel({ isDark }: { isDark: boolean }) {
  const { isOpen, content, width, isFullScreen } = useSidePanel();
  const [isOverlayMode, setIsOverlayMode] = useState(false);

  useEffect(() => {
    const check = () => setIsOverlayMode(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Updated logic: Should only show if context says isOpen AND there is actual content to display
  const shouldShow = isOpen && !!content;

  const panelWidth = isOverlayMode
    ? (isFullScreen ? "100%" : `${width}px`)
    : `${Math.min(width, 340)}px`;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.aside
          key="side-panel"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className={`
            h-full min-h-0 max-w-full backdrop-blur-xl shrink-0 overflow-hidden flex flex-col z-[50]
            ${isOverlayMode ? "absolute right-0 top-0 shadow-2xl" : "relative"}
            ${isDark ? "bg-slate-900/90 border-l border-slate-800" : "bg-white/95 border-l border-black/5"}
          `}
          style={{ width: panelWidth }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              {content}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}