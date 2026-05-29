"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { GoogleOAuthProvider } from "@react-oauth/google";
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
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <NextAuthSessionProvider
        session={session}
        refetchInterval={5 * 60} 
        refetchOnWindowFocus={true}
        refetchWhenOffline={false}
      >
        {children}
      </NextAuthSessionProvider>
    </GoogleOAuthProvider>
  );
}