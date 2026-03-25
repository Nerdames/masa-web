// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/core/lib/auth";

/**
 * MASA v6 NextAuth API route
 * - Uses JWT-only sessions
 * - CredentialsProvider against AuthorizedPersonnel
 * - Fully compatible with your lib/auth.ts
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
