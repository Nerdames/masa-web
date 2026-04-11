"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import TopBar from "@/core/components/layout/TopBar";
import { cn } from "@/core/utils";

/**
 * MASA Terminal Root Layout (Zero-Scroll Edition)
 * Updated to match DashboardRootLayout's TopBar and Theme logic.
 */
interface TerminalLayoutProps {
  children: React.ReactNode;
}

export default function TerminalLayout({ children }: TerminalLayoutProps) {
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  /**
   * Time-Aware Theme logic (Syncs with Dashboard/Operations Hub)
   */
  useEffect(() => {
    const handleTheme = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 7 || hour >= 19);
    };
    handleTheme();
    setMounted(true);
    const timer = setInterval(handleTheme, 60000);
    return () => clearInterval(timer);
  }, []);

  // Prevent hydration flash
  if (!mounted) return <div className="h-screen w-screen bg-slate-50 dark:bg-[#020617]" />;

  return (
    <div className={cn(
      "h-screen w-screen flex flex-col overflow-hidden font-sans select-none transition-colors duration-1000",
      isDark ? "bg-[#020617] text-slate-200" : "bg-slate-50 text-slate-900"
    )}>
      
      {/* 1. Global Navigation Bar (Synchronized with DashboardRootLayout) */}
      <header className={cn(
        "shrink-0 relative z-[1000] border-b backdrop-blur-md transition-colors",
        isDark ? "bg-slate-900/50 border-slate-800" : "bg-white/80 border-black/5"
      )}>
        <TopBar />
        
        {/* Progress bar logic from DashboardRootLayout */}
        {status === "loading" && (
          <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden bg-transparent">
            <div className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-500 animate-progress-slide w-full" />
          </div>
        )}
      </header>

      {/* 2. Main Viewport Container */}
      <div className="flex-1 relative flex min-h-0 overflow-hidden">
        <main 
          className={cn(
            "flex-1 relative min-h-0 overflow-hidden transition-colors duration-300",
            isDark ? "bg-slate-950/20" : "bg-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
          )}
        >
          {children}
        </main>
      </div>

      {/* 3. Visual Anchor (Harmonized with Operational suite) */}
      <div className={cn(
        "h-[2px] w-full shrink-0 transition-colors duration-1000",
        isDark ? "bg-blue-500/50" : "bg-slate-900"
      )} />

      {/* Shared Animation Styles */}
      <style jsx global>{`
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-progress-slide {
          animation: progress-slide 1.5s infinite linear;
        }
      `}</style>
    </div>
  );
}