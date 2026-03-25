// src/core/providers/ClientWrappers.tsx
"use client";

import { usePathname } from "next/navigation";
import { AlertProvider } from "@/core/components/feedback/AlertProvider";
import { SessionProvider } from "@/core/providers/SessionProvider";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";

function RealTimeListener() {
  usePusherNotifications();
  return null;
}

export function ClientWrappers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Define workspace prefixes that require 100% screen utility (No Footer)
  // Matches the logic in your RootPage and Proxy
  const WORKSPACE_ROUTES = ["/dashboard", "/pos", "/inventory", "/reset-password"];
  const isWorkspace = WORKSPACE_ROUTES.some(route => pathname?.startsWith(route));

  return (
    <SessionProvider>
      <AlertProvider>
        <RealTimeListener />
        
        <div className="flex flex-col h-full w-full overflow-hidden bg-inherit">
          {/* The 'main' container captures the children. 
              min-h-0 prevents flex-children from expanding the page 
              beyond the 100dvh limit set in layout.tsx.
          */}
          <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
            {children}
          </main>

          {/* The Footer only renders for 'Marketing/Auth' contexts 
              (Welcome, Signin, Register, etc.)
          */}
          {!isWorkspace && (
            <footer className="flex justify-center text-center text-[6px] md:text-[8px] font-black tracking-[0.3em] text-slate-400 py-2 bg-white/40 backdrop-blur-md border-t border-slate-200/50 uppercase z-50">
              © {new Date().getFullYear()} MASA Engine • All Systems Operational
            </footer>
          )}
        </div>
      </AlertProvider>
    </SessionProvider>
  );
}