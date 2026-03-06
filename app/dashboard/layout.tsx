"use client";

import { ReactNode, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

interface Props {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: Props) {
  const { status } = useSession({ required: true, onUnauthenticated: () => {} });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-[#FAFAFA]">
      {/* Gemini-style loading animation logic:
        The progress bar is embedded directly into the TopBar container.
      */}
      <div className="flex-shrink-0 z-[70] relative">
        <TopBar />
        
        {status === "loading" && (
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-transparent overflow-hidden">
            <div className="h-full w-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-400 animate-[loading_1.5s_infinite_ease-in-out]" />
          </div>
        )}
      </div>

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden relative z-0">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 overflow-y-auto bg-white ml-1 pl-4 relative z-0">
          {/* Content visibility transition */}
          <div className={`transition-opacity duration-500 ${status === "loading" ? "opacity-0" : "opacity-100"}`}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile menu button */}
      {!sidebarOpen && (
        <div className="fixed top-2 left-2 lg:hidden z-[80]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100 bg-white shadow-sm border border-black/5"
          >
            <i className="bx bx-menu text-2xl" />
          </button>
        </div>
      )}

      {/* Inline styles for the custom loading bar animation */}
      <style jsx global>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}