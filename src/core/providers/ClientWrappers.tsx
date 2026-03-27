// src/core/providers/ClientWrappers.tsx
"use client";

import { AlertProvider } from "@/core/components/feedback/AlertProvider";
import { SessionProvider } from "@/core/providers/SessionProvider";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";

function RealTimeListener() {
  usePusherNotifications();
  return null;
}

export function ClientWrappers({ children }: { children: React.ReactNode }) {



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


        </div>
      </AlertProvider>
    </SessionProvider>
  );
}