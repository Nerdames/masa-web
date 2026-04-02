"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  session?: Session | null;
}

/**
 * PRODUCTION NOTE: 
 * refetchInterval is set to 5 mins to sync with the auth.ts DB_UPDATE_THROTTLE.
 * This ensures the client catches mid-session account deactivations/locks.
 */
export function SessionProvider({ children, session }: Props) {
  return (
    <NextAuthSessionProvider
      session={session}
      refetchInterval={5 * 60} 
      refetchOnWindowFocus={true}
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}