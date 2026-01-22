import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "boxicons/css/boxicons.min.css"; // Boxicons
import "./globals.css";
import { SessionProvider } from "./providers/SessionProvider"; // NextAuth client provider
import { ToastProvider } from "@/components/feedback/ToastProvider"; // Toasts

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MASA",
  description: "Integrated Management, Sales & Administration App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen bg-white text-black overflow-hidden`}
      >
        {/* NextAuth session provider */}
        <SessionProvider>
          {/* ToastProvider available to all children */}
          <ToastProvider>
            <main className="flex-1 flex flex-col overflow-hidden h-screen">
              {children}
            </main>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
