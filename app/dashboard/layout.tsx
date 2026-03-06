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

  // Show skeleton while session is loading
  if (status === "loading") {
    return (
      <div className="flex flex-col h-screen bg-gray-50 animate-pulse">
        <div className="w-full h-12 bg-gray-200 z-[60]" />
        <div className="flex flex-1">
          <div className="w-64 bg-gray-200 z-[50]" />
          <main className="flex-1 bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* TopBar always on top */}
      <div className="flex-shrink-0 z-[70] relative">
        <TopBar />
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden relative z-0">
        {/* Sidebar always above content but below TopBar */}
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-white ml-1 pl-4 relative z-0">
          {children}
        </main>
      </div>

      {/* Mobile menu button (always above sidebar and content) */}
      {!sidebarOpen && (
        <div className="fixed top-2 left-2 lg:hidden z-[80]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100 bg-white shadow"
          >
            <i className="bx bx-menu text-2xl" />
          </button>
        </div>
      )}
    </div>
  );
}