"use client";

import { ReactNode } from "react";
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
      {/* Background updated to match WelcomePage gradient */}
      <div className="flex flex-col h-screen w-full bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#EFF6FF] overflow-hidden text-slate-900">
        
        {/* Background Decorative Elements (Consistent with Landing Page) */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
           <div className="absolute -left-20 -top-20 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px]" />
           <div className="absolute -right-20 -bottom-20 w-[400px] h-[400px] bg-blue-400/10 rounded-full blur-[100px]" />
        </div>

        {/* TopBar Area - Glassmorphism style */}
        <div className="flex-shrink-0 relative z-[1000] bg-white/70 backdrop-blur-md border-b border-slate-200/50">
          <TopBar/>
          {status === "loading" && (
            <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
              <div className="h-full bg-gradient-to-r from-indigo-600 via-blue-500 to-cyan-500 animate-progress-slide w-full" />
            </div>
          )}
        </div>

        {/* Layout Wrapper */}
        <div className="flex flex-1 overflow-hidden relative z-10">
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

function DynamicSidePanel() {
  const { isOpen, content, closePanel, title, width, isFullScreen } = useSidePanel();
  const panelWidth = isFullScreen ? "100%" : `${width}px`;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePanel}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[1100] md:hidden"
          />

          <motion.aside
            key="side-panel"
            initial={{ x: "100%", width: 0 }}
            animate={{ x: 0, width: isFullScreen ? "100%" : 340 }}
            exit={{ x: "100%", width: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`
              fixed right-0 top-0 h-full bg-white/90 backdrop-blur-xl z-[1200] shadow-2xl
              md:relative md:top-auto md:right-auto md:z-10 md:shadow-none md:border-l md:border-slate-200/60
              shrink-0 overflow-hidden flex flex-col
            `}
            style={{ width: panelWidth }}
          >
            {content && (
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-transparent shrink-0">
                <div className="flex items-center gap-2 overflow-hidden">
                   <button 
                    onClick={closePanel} 
                    className="p-1 -ml-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                   >
                     <i className='bx bx-chevron-left text-2xl'></i>
                   </button>
                   <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest truncate">{title}</h3>
                </div>
                <button 
                  onClick={closePanel} 
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <i className='bx bx-x text-2xl'></i>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden h-full">
              {content ? (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  {content}
                </div>
              ) : (
                <MasaCalendar />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}