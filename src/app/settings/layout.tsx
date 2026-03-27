"use client";

import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/core/components/layout/Sidebar";
import TopBar from "@/core/components/layout/TopBar";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";
import { SidePanelProvider, useSidePanel } from "@/core/components/layout/SidePanelContext";
import { motion, AnimatePresence } from "framer-motion";
import MasaCalendar from "@/core/components/shared/MasaCalendar"; 

interface SettingsLayoutProps {
  children: ReactNode;
}

/**
 * MASA v2.0 - Settings Operational Layout
 * Wraps all settings sub-pages (Profile, Security, Audit) with the SidePanel context.
 */
export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const { status } = useSession({ required: true });
  usePusherNotifications();

  return (
    <SidePanelProvider>
      <div className="flex flex-col h-screen w-full bg-gradient-to-br from-[#FFD8B1] via-[#FFF5F0] to-[#D8FFE5] overflow-hidden">
        
        {/* TopBar Area */}
        <div className="flex-shrink-0 relative z-[1000] bg-white border-b border-black/5">
          <TopBar/>
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
              {children}
            </main>

            {/* Side Panel Component - Mounted as a sibling to main */}
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
 * DYNAMIC SIDE PANEL 
 * Persistent on desktop, overlay on mobile.
 */
function DynamicSidePanel() {
  const { isOpen, content, closePanel, width, isFullScreen } = useSidePanel();

  // Determine actual width based on state
  const panelWidth = isFullScreen ? "100%" : `${width || 380}px`;

  return (
    <>
      <AnimatePresence>
        {/* Mobile Overlay: Only shows when a panel is explicitly "Open" on small screens */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePanel}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1100] md:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        key="side-panel"
        initial={false} // Prevent initial slide-in on desktop load
        animate={{ 
          x: 0,
          // On mobile, if not "open", we slide it off-screen
          translateX: typeof window !== 'undefined' && window.innerWidth < 768 && !isOpen ? "100%" : "0%" 
        }}
        className={`
          fixed right-0 top-0 h-full bg-white z-[1200] shadow-2xl
          md:relative md:top-auto md:right-auto md:z-10 md:shadow-none md:border-l md:border-black/[0.04]
          shrink-0 overflow-hidden flex flex-col transition-[width] duration-300 ease-in-out
        `}
        style={{ width: panelWidth }}
      >
        {/* PANEL INTERNAL WRAPPER */}
        <div className="flex-1 overflow-hidden h-full flex flex-col bg-white">
          <AnimatePresence mode="wait">
            {content ? (
              <motion.div 
                key="dynamic-content"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 h-full"
              >
                {content}
              </motion.div>
            ) : (
              <motion.div 
                key="default-calendar"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 h-full"
              >
                <MasaCalendar />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}