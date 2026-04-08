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
      {/* 1. ROOT CONTAINER: Mimics WelcomePage Background & Lock */}
      <div className="h-screen w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] text-slate-900 relative overflow-hidden flex flex-col">
        
        {/* Background Decorative Elements (SVG Mimicry) */}
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

        {/* 2. TOPBAR: Fixed Height, High Z-Index */}
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
            {/* 4. MAIN CONTAINER: 
                - overflow-hidden: Prevents the whole page from scrolling.
                - flex-col: Allows children to stack (Header then Scrollable Content).
            */}
            <main className={`flex-1 flex flex-col min-w-0 min-h-0 transition-opacity duration-300 ${status === "loading" ? "opacity-0" : "opacity-100"}`}>
               {/* Children will handle their own internal scrolling */}
               {children}
            </main>

            <DynamicSidePanel />
          </div>
        </div>

        {/* Global Styles for "Strict Fit" */}
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
          /* Custom scrollbar to keep UI clean */
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </div>
    </SidePanelProvider>
  );
}

function DynamicSidePanel() {
  const { isOpen, content, width, isFullScreen } = useSidePanel();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const shouldShow = isMobile ? !!content : isOpen;
  const panelWidth = isMobile
    ? isFullScreen ? "100%" : `${width}px`
    : `${Math.min(width, 340)}px`;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.aside
          key="side-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: panelWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="relative h-full min-h-0 max-w-full bg-white/90 backdrop-blur-xl border-l border-black/5 shrink-0 overflow-hidden flex flex-col z-[50]"
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