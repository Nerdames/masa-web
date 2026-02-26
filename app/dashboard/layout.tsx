"use client";

import { ReactNode, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

interface Props {
  children: ReactNode;
}

export default function DashboardRootLayout({ children }: Props) {
  const { status } = useSession({ required: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  // Redirect to sign in page if not authenticated
  if (status === "unauthenticated") {
    router.push("/auth/signin");
    return null;
  }

  // Show skeleton while session is loading
  if (status === "loading") {
    return (
      <div className="flex flex-col h-screen bg-gray-50 animate-pulse">
        <div className="w-full h-10 bg-gray-200" />
        <div className="flex flex-1">
          <div className="w-64 bg-gray-200" />
          <main className="flex-1 bg-gray-100" />
        </div>
      </div>
    );
  }

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
        <main className="flex-1 overflow-hidden bg-white mx-1">{children}</main>
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