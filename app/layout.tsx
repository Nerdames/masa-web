"use client";

import { usePathname } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import "boxicons/css/boxicons.min.css";
import "./globals.css";
import { SessionProvider } from "./providers/SessionProvider";
import { ToastProvider } from "@/components/feedback/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine if we should hide the footer (e.g., inside any dashboard route)
  const isDashboard = pathname?.startsWith("/dashboard");

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased 
        h-dvh w-full overflow-hidden 
        bg-gradient-to-br from-blue-50 via-white to-green-50 text-black`}
      >
        <SessionProvider>
          <ToastProvider>
            
            {/* App Layout Container */}
            <div className="flex flex-col h-full w-full">

              {/* Page Content: Occupies all space when footer is hidden */}
              <main className="flex-1 flex flex-col overflow-hidden">
                {children}
              </main>

              {/* Global Footer: Rendered conditionally */}
              {!isDashboard && (
                <footer className="text-center text-xs text-gray-400 py-3 shrink-0 bg-white/30 backdrop-blur-sm border-t border-black/5">
                  © {new Date().getFullYear()} MASA. All rights reserved.
                </footer>
              )}

            </div>

          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}