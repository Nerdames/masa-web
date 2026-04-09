"use client";

import React from "react";
import TopBar from "@/core/components/layout/TopBar";
import { cn } from "@/core/utils";

/**
 * MASA Terminal Root Layout (Zero-Scroll Edition)
 * Engineered to lock all content within the physical viewport.
 * Footer removed; Main canvas is strictly constrained.
 */
interface TerminalLayoutProps {
  children: React.ReactNode;
}

export default function TerminalLayout({ children }: TerminalLayoutProps) {
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden font-sans select-none">
      
      {/* 1. Global Navigation Bar (Fixed Height) */}
      <div className="shrink-0 z-[120]">
        <TopBar />
      </div>

      {/* 2. Main Viewport Container */}
      <div className="flex-1 relative flex min-h-0 overflow-hidden">
        
        {/* The Operational Canvas:
            - min-h-0: Essential for flex children to allow inner content to be smaller than initial size
            - overflow-hidden: Ensures no accidental scrollbars if children calculate dimensions incorrectly
        */}
        <main 
          className={cn(
            "flex-1 relative bg-white min-h-0 overflow-hidden",
            "shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]" 
          )}
        >
          {children}
        </main>
      </div>

      {/* Visual Anchor: 
          A subtle high-contrast bottom border instead of a footer 
          to define the terminal's physical boundary.
      */}
      <div className="h-[2px] w-full bg-slate-900 shrink-0" />
    </div>
  );
}