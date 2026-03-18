"use client";

import { usePathname } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import "boxicons/css/boxicons.min.css";
import "./globals.css";

// Providers & Hooks
import { SessionProvider } from "./providers/SessionProvider";
import { AlertProvider } from "@/components/feedback/AlertProvider";
import { usePusherNotifications } from "@/hooks/usePusherNotifications";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * RealTimeListener activates Pusher subscriptions once the session is available.
 */
function RealTimeListener(): null {
  usePusherNotifications();
  return null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine if we should hide the footer (e.g., inside any dashboard route)
  const isDashboard = pathname?.startsWith("/dashboard");

  return (
    <html lang="en" className="scroll-smooth h-full overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased 
        h-dvh w-full overflow-hidden 
        bg-gradient-to-br from-blue-50 via-white to-green-50 text-black flex flex-col`}
      >
        <SessionProvider>
          <AlertProvider>
            {/* Activates WebSocket listening for MASA alerts */}
            <RealTimeListener />

            {/* App Layout Container */}
            <div className="flex flex-col h-full w-full overflow-hidden">

              {/* Page Content */}
              <main className="flex-1 flex flex-col overflow-hidden relative">
                {children}
              </main>

              {/* Global Footer: Rendered conditionally */}
              {!isDashboard && (
                <footer className="text-center text-[10px] font-black tracking-[0.3em] text-slate-400 py-3 shrink-0 bg-white/30 backdrop-blur-sm border-t border-black/5 uppercase z-50">
                  © {new Date().getFullYear()} MASA Engine • All Systems Operational
                </footer>
              )}

            </div>
          </AlertProvider>
        </SessionProvider>
      </body>
    </html>
  );
}