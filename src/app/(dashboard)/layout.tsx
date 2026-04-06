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
      <div className="flex flex-col h-screen w-full bg-gradient-to-br from-[#FFD8B1] via-[#FFF5F0] to-[#D8FFE5] overflow-hidden">

        {/* TopBar */}
        <div className="flex-shrink-0 relative z-[1000] bg-white border-b border-black/5">
          <TopBar />
          {status === "loading" && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
              <div className="h-full bg-gradient-to-r from-orange-500 via-green-400 to-blue-500 animate-progress-slide w-full" />
            </div>
          )}
        </div>

        {/* Layout Wrapper */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          <Sidebar />

          {/* Core Content + Panel */}
          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">

            {/* MAIN CONTENT */}
            <main className={`flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden transition-opacity duration-300 ${status === "loading" ? "opacity-0" : "opacity-100"}`}>
              <div className="w-full max-w-full relative overflow-x-auto">
                {children}
              </div>
            </main>

            {/* SIDE PANEL */}
            <DynamicSidePanel />
          </div>
        </div>

        {/* Global Styles */}
        <style jsx global>{`
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

/**
 * SIDE PANEL
 * Desktop → max width 340px
 * Mobile → flexible width / fullscreen
 */
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

  // Desktop max width: 340px, Mobile/fullscreen: flexible
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
          className="
            relative
            h-full
            min-h-0
            max-w-full
            bg-white
            border-l border-black/5
            shrink-0
            overflow-hidden
            flex flex-col
          "
          style={{ width: panelWidth }}
        >
          {/* BODY */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
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