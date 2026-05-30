// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/infrastructure/auth/config";

/**
 * MASA v6 NextAuth API route
 * - Uses JWT-only sessions
 * - CredentialsProvider against AuthorizedPersonnel
 * - Fully compatible with your infrastructure/auth/config.ts
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };