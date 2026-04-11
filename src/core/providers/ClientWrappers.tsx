"use client";

import { useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { AlertProvider } from "@/core/components/feedback/AlertProvider";
import { SessionProvider } from "@/core/providers/SessionProvider";
import { usePusherNotifications } from "@/core/hooks/usePusherNotifications";
import { getPusherClient } from "@/core/lib/pusher";

/**
 * SECURITY WATCHDOG
 * Monitors session health and enforces absolute session termination.
 */
function SecurityWatchdog({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const handleSecurityLogout = useCallback(async (reason: string) => {
    console.warn(`[SECURITY_ENFORCEMENT] Logging out. Reason: ${reason}`);
    
    // 1. Immediately sever WebSocket to stop ghost notifications
    getPusherClient().disconnect();
    
    // 2. Perform a clean sign-out to clear the session cookie
    await signOut({ 
      callbackUrl: `/signin?error=${reason}`,
      redirect: true 
    });
  }, []);

  // Monitor for 'expired' flag or 'unauthenticated' status
  useEffect(() => {
    if (status === "unauthenticated") {
      getPusherClient().disconnect();
    }

    if (session?.user?.expired) {
      handleSecurityLogout("SessionExpired");
    }

    if (session?.user?.disabled || session?.user?.locked) {
      handleSecurityLogout(session.user.disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_LOCKED_ADMIN");
    }
  }, [status, session, handleSecurityLogout]);

  /**
   * GLOBAL FETCH INTERCEPTOR
   * Solves the [CLIENT_FETCH_ERROR] "Unexpected token '<'" issue.
   * Instead of letting the browser try to parse a redirect HTML page as JSON,
   * we catch the 401 and trigger a controlled logout.
   */
  useEffect(() => {
    const { fetch: originalFetch } = window;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Check if middleware returned 401 (Unauthorized)
      if (response.status === 401) {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : "";
        
        // Don't intercept actual auth requests to avoid infinite loops
        if (!url.includes("/api/auth")) {
          handleSecurityLogout("SessionExpired");
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [handleSecurityLogout]);

  return <>{children}</>;
}

/**
 * REAL-TIME LISTENER
 * Only active during an authenticated session.
 */
function RealTimeListener() {
  useSession();
  
  // Custom hook that manages Pusher subscriptions
  usePusherNotifications();
  
  return null;
}

export function ClientWrappers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SecurityWatchdog>
        <AlertProvider>
          <RealTimeListener />
          
          <div className="flex flex-col h-full w-full overflow-hidden bg-inherit">
            <main className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
              {children}
            </main>
          </div>
        </AlertProvider>
      </SecurityWatchdog>
    </SessionProvider>
  );
}