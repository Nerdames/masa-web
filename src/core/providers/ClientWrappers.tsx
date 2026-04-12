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
 * Optimized to prevent redirect loops during hydration and navigation.
 */
function SecurityWatchdog({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  const handleSecurityLogout = useCallback(async (reason: string) => {
    // 1. Navigation Guard: Never redirect if already on login page
    if (window.location.pathname.startsWith("/signin")) return;

    console.warn(`[SECURITY_ENFORCEMENT] Logging out. Reason: ${reason}`);
    
    // 2. Immediate socket severance
    getPusherClient().disconnect();
    
    // 3. Clean transition
    await signOut({ 
      callbackUrl: `/signin?error=${reason}`,
      redirect: true 
    });
  }, []);

  // Monitor session state changes
  useEffect(() => {
    // Only act if we are in an authenticated state
    if (status === "authenticated" && session?.user) {
      if (session.user.expired) {
        handleSecurityLogout("SessionExpired");
      } else if (session.user.disabled || session.user.locked) {
        handleSecurityLogout(session.user.disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_LOCKED_ADMIN");
      }
    } else if (status === "unauthenticated") {
      getPusherClient().disconnect();
    }
  }, [status, session, handleSecurityLogout]);

  // GLOBAL FETCH INTERCEPTOR
  useEffect(() => {
    const { fetch: originalFetch } = window;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Handle 401s without triggering a forced redirect loop
      if (response.status === 401) {
        const url = typeof args[0] === "string" ? args[0] : "";
        
        // Only log/handle if authenticated; ignore during loading or auth calls
        if (!url.includes("/api/auth") && status === "authenticated") {
           console.warn("[SECURITY] Unauthorized access detected; middleware handling redirect.");
        }
      }

      return response;
    };

    return () => { window.fetch = originalFetch; };
  }, [status]); // Dependency on status ensures we don't trigger while loading

  return <>{children}</>;
}

function RealTimeListener() {
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