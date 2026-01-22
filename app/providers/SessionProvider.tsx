"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  session?: Session | null; // strongly typed; can extend if needed
}

export function SessionProvider({ children, session }: Props) {
  return (
    <NextAuthSessionProvider
      session={session}
      refetchInterval={5 * 60} // refresh every 5 minutes
      refetchOnWindowFocus={true}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
