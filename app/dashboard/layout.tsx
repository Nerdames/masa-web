"use client";

import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { usePusherNotifications } from "@/hooks/usePusherNotifications";
import { SidePanelProvider, useSidePanel } from "@/components/layout/SidePanelContext";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: DashboardRootLayoutProps) {
  const { status } = useSession({ required: true });
  usePusherNotifications();

  return (
    <SidePanelProvider>
      <div className="flex flex-col h-screen w-full bg-gradient-to-br from-[#FFD8B1] via-[#FFF5F0] to-[#D8FFE5] overflow-hidden">
        
        {/* TopBar Area */}
        <div className="flex-shrink-0 relative z-[1000] bg-white border-b border-black/5">
          <TopBar isLoading={status === "loading"} />
          {status === "loading" && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
              <div className="h-full bg-gradient-to-r from-orange-500 via-green-400 to-blue-500 animate-progress-slide w-full" />
            </div>
          )}
        </div>

        {/* Layout Wrapper */}
        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar />

          {/* Core Content Container */}
          <div className="flex flex-1 min-w-0 overflow-hidden relative">
            <main
              className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden transition-opacity duration-500 ${
                status === "loading" ? "opacity-0" : "opacity-100"
              }`}
            >
              {/* Padding removed as requested; children components manage their own spacing */}
              {children}
            </main>

            {/* Side Panel Component */}
            <DynamicSidePanel />
          </div>
        </div>

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
 * Stable Dynamic Side Panel
 * Strict 340px width on desktop.
 */
function DynamicSidePanel() {
  const { isOpen, content, closePanel } = useSidePanel();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile Overlay Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePanel}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1100] md:hidden"
          />

          {/* Panel Content */}
          <motion.aside
            initial={{ x: "100%", width: 0 }}
            animate={{ x: 0, width: 340 }}
            exit={{ x: "100%", width: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`
              fixed right-0 top-0 h-full bg-white z-[1200] shadow-2xl
              md:relative md:top-auto md:right-auto md:z-10 md:shadow-none md:border-l md:border-black/5
              w-full sm:w-[340px] shrink-0 overflow-hidden
            `}
          >
            {/* Fixed internal width prevents content reflow during width animation */}
            <div className="w-full sm:w-[340px] h-full flex flex-col bg-white">
              {content}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}