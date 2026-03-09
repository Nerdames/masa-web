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
    <div className="flex flex-col h-screen bg-gray-50">
      {/* TopBar with loading animation */}
      <div className="flex-shrink-0 relative z-[70]">
        <TopBar />

        {status === "loading" && (
          <div className="absolute bottom-0 left-0 w-full h-[4px] overflow-hidden bg-transparent">
            <div className="h-full w-full gradient-loading animate-gradient-slide" />
          </div>
        )}
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden relative z-0">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto bg-gray-50 ml-1 pl-4 relative z-0">
          <div
            className={`transition-opacity duration-500 ${
              status === "loading" ? "opacity-0" : "opacity-100"
            }`}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Mobile menu toggle */}
      {!sidebarOpen && (
        <div className="fixed top-2 left-2 lg:hidden z-[80]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md bg-white shadow-sm border border-black/5 hover:bg-gray-100"
          >
            <i className="bx bx-menu text-2xl text-gray-700" />
          </button>
        </div>
      )}

      {/* Global keyframes & gradient animation */}
      <style jsx global>{`
        .gradient-loading {
          background: linear-gradient(
            90deg,
            #FF6B35,
            #FCA311,
            #FF6B35,
            #FCA311
          );
          background-size: 200% 100%;
        }

        @keyframes gradient-slide {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .animate-gradient-slide {
          animation: gradient-slide 1.5s linear infinite;
        }
      `}</style>
    </div>
  );
}