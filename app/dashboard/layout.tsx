"use client";

import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { usePusherNotifications } from "@/hooks/usePusherNotifications"; // Import the hook

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({
  children,
}: DashboardRootLayoutProps) {
  const { status } = useSession({ required: true });

  /** * Initialize Global Real-time Listeners
   * This hook handles "critical-alert" events and pushes them to 
   * your AlertProvider (toasts/banners) automatically.
   */
  usePusherNotifications();

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#FFD8B1] via-[#FFF5F0] to-[#D8FFE5] overflow-hidden">
      
      {/* TopBar */}
      <div className="flex-shrink-0 relative z-[1000]">
        <TopBar />

        {status === "loading" && (
          <div className="absolute bottom-0 left-0 w-full h-[4px] overflow-hidden bg-transparent">
            <div className="h-full w-full gradient-loading animate-gradient-slide" />
          </div>
        )}
      </div>

      {/* Layout Wrapper */}
      <div className="flex flex-1 overflow-hidden relative z-0">

        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main
          className={`flex-1 transition-opacity duration-500 ${
            status === "loading" ? "opacity-0" : "opacity-100"
          }`}
        >
          {children}
        </main>

      </div>

      {/* Global Styles */}
      <style jsx global>{`
        .gradient-loading {
          background: linear-gradient(
            90deg,
            #FF6B35,
            #FF6B35,
            #35ff35,
            #4c11fc
          );
          background-size: 200% 100%;
        }

        @keyframes gradient-slide {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .animate-gradient-slide {
          animation: gradient-slide 1.5s linear infinite;
        }
      `}</style>
    </div>
  );
}