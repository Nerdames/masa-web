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
    <div className="flex h-screen bg-white">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="hidden lg:flex">
          <TopBar />
        </div>

        <div className="flex justify-end px-3 py-2 border-b lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md border hover:bg-gray-100"
          >
            <i className="bx bx-menu text-2xl" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
