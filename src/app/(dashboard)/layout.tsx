"use client";

import { ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/core/components/layout/Sidebar";
import TopBar from "@/core/components/layout/TopBar";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";
import { SidePanelProvider, useSidePanel } from "@/core/components/layout/SidePanelContext";
import { motion, AnimatePresence } from "framer-motion";
import MasaCalendar from "@/core/components/shared/MasaCalendar";

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: DashboardRootLayoutProps) {
  const { status } = useSession({ required: true });
  usePusherNotifications();

  return (
    <SidePanelProvider>
      {/* 1. ROOT CONTAINER */}
      <div className="h-screen w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] text-slate-900 relative overflow-hidden flex flex-col">
        
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <svg className="absolute -left-20 -top-20 opacity-10" viewBox="0 0 600 600" style={{ width: "min(45vw, 450px)" }}>
            <defs>
              <linearGradient id="gA" x1="0" x2="1">
                <stop offset="0" stopColor="#463aed" />
                <stop offset="1" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            <circle cx="300" cy="300" r="260" fill="url(#gA)" />
          </svg>
          <svg className="absolute -right-10 -bottom-10 opacity-10" viewBox="0 0 600 600" style={{ width: "min(40vw, 400px)" }}>
            <defs>
              <linearGradient id="gB" x1="0" x2="1">
                <stop offset="0" stopColor="#FF7AB6" />
                <stop offset="1" stopColor="#FFD580" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="600" height="600" rx="120" fill="url(#gB)" />
          </svg>
        </div>

        {/* 2. TOPBAR */}
        <header className="flex-none relative z-[1000] bg-white/80 backdrop-blur-md border-b border-black/5">
          <TopBar />
          {status === "loading" && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-blue-400 to-cyan-500 animate-progress-slide w-full" />
            </div>
          )}
        </header>

        {/* 3. LAYOUT WRAPPER */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
          <Sidebar />

          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">
            <main className={`flex-1 flex flex-col min-w-0 min-h-0 transition-opacity duration-300 ${status === "loading" ? "opacity-0" : "opacity-100"}`}>
               {children}
            </main>

            {/* The Fixed SidePanel */}
            <DynamicSidePanel />
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

function DynamicSidePanel() {
  const { isOpen, content, width, isFullScreen } = useSidePanel();
  const [isOverlayMode, setIsOverlayMode] = useState(false);

  useEffect(() => {
    // 1024px captures both mobile and most tablets (iPad/Android) in portrait/landscape
    const check = () => setIsOverlayMode(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // On mobile/tablet, we only show if there is specific content injected
  const shouldShow = isOverlayMode ? !!content : isOpen;
  
  const panelWidth = isOverlayMode
    ? (isFullScreen ? "100%" : `${width}px`)
    : `${Math.min(width, 340)}px`;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.aside
          key="side-panel"
          // Slide in from right for a cleaner feel than width animation
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className={`
            h-full min-h-0 max-w-full bg-white/95 backdrop-blur-xl 
            border-l border-black/5 shrink-0 overflow-hidden flex flex-col z-[50]
            ${isOverlayMode ? "absolute right-0 top-0 shadow-2xl" : "relative"}
          `}
          style={{ width: panelWidth }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
            {content ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                {content}
              </div>
            ) : (
              <MasaCalendar />
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}