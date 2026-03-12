"use client";

import { ReactNode, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

interface DashboardRootLayoutProps {
  children: ReactNode;
}

export default function DashboardRootLayout({
  children,
}: DashboardRootLayoutProps) {
  const { status } = useSession({ required: true });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#FFD8B1] via-[#FFF5F0] to-[#D8FFE5] overflow-hidden">
      
      {/* TopBar */}
      <div className="flex-shrink-0 relative z-[70]">
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
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

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