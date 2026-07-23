import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge-safe middleware — uses the DB-free config for route protection.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo).*)"],
};
