"use client";

import React, { useEffect, useCallback, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { AlertProvider } from "@/core/components/feedback/AlertProvider";
import { SessionProvider } from "@/core/providers/SessionProvider";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";
import { getPusherClient } from "@/core/lib/pusher";

/**
 * SECURITY WATCHDOG
 * Monitors session health and enforces absolute session termination.
 * Fully synced with auth.ts DB_UPDATE_THROTTLE and KILL-SWITCH logic.
 */
function SecurityWatchdog({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const handleSecurityLogout = useCallback(async (reason: string) => {
    // 1. Navigation Guard: Never redirect if already on login page
    if (window.location.pathname.startsWith("/signin")) return;

    console.warn(`[SECURITY_ENFORCEMENT] Logging out. Reason: ${reason}`);
    
    // 2. Immediate socket severance
    getPusherClient().disconnect();
    
    // 3. Clean transition to signin with error context
    await signOut({ 
      callbackUrl: `/signin?error=${reason}`,
      redirect: true 
    });
  }, []);

  // Monitor session state changes for mid-shift locks/deactivations
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      if (session.user.expired) {
        handleSecurityLogout("SessionExpired");
      } else if (session.user.disabled || session.user.locked) {
        const reason = session.user.disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_LOCKED_ADMIN";
        handleSecurityLogout(reason);
      }
    } else if (status === "unauthenticated") {
      getPusherClient().disconnect();
    }
  }, [status, session, handleSecurityLogout]);

  // GLOBAL FETCH INTERCEPTOR: Catch 401s from API routes
  useEffect(() => {
    const { fetch: originalFetch } = window;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const url = typeof args[0] === "string" ? args[0] : "";
        if (!url.includes("/api/auth") && status === "authenticated") {
           console.warn("[SECURITY] Unauthorized access detected.");
        }
      }
      return response;
    };

    return () => { window.fetch = originalFetch; };
  }, [status]);

  return <>{children}</>;
}

/**
 * REAL-TIME LISTENER
 * Extracted into a standalone component to sit inside the AlertProvider.
 */
function RealTimeListener() {
  usePusherNotifications();
  return null;
}

/**
 * CONTENT WRAPPER
 * Forces mounting only on client-side to prevent hydration mismatches
 * and ensure the AlertProvider context is available in the DOM.
 */
function WrapperContent({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {/* Only run the notification hook once the client is ready */}
      {mounted && <RealTimeListener />}
      <div className="flex flex-col h-full w-full overflow-hidden bg-inherit">
        <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          {children}
        </main>
      </div>
    </>
  );
}

/**
 * CLIENT WRAPPERS (ROOT)
 * The hierarchy ensures AlertProvider is a parent of WrapperContent.
 */
export function ClientWrappers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SecurityWatchdog>
        <AlertProvider>
          <WrapperContent>
            {children}
          </WrapperContent>
        </AlertProvider>
      </SecurityWatchdog>
    </SessionProvider>
  );
}