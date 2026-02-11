"use client";

import { ReactNode, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

interface Props {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* TopBar always full width */}
      <div className="flex-shrink-0">
        <TopBar />
      </div>

      {/* Content area: Sidebar + Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-white">
          {children}
        </main>
      </div>

      {/* Mobile menu button (top-left, floats above Sidebar) */}
      {!sidebarOpen && (
        <div className="fixed top-2 left-2 lg:hidden z-50">
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
