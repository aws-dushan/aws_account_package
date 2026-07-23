import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no DB / no argon2 imports) — shared by middleware and
 * the full server config. Route protection + JWT/session shaping live here.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [], // the Credentials provider is added in auth.ts (server-only)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const onLogin = nextUrl.pathname.startsWith("/login");
      if (onLogin) {
        return isLoggedIn ? Response.redirect(new URL("/dashboard", nextUrl)) : true;
      }
      return isLoggedIn; // everything else requires a session
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as {
          username?: string;
          isAdmin?: boolean;
          mustChangePassword?: boolean;
          tenantId?: string | null;
          tenantSlug?: string | null;
        };
        token.username = u.username;
        token.isAdmin = u.isAdmin;
        token.mustChangePassword = u.mustChangePassword;
        token.tenantId = u.tenantId ?? null;
        token.tenantSlug = u.tenantSlug ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const u = session.user as unknown as Record<string, unknown>;
        u.id = token.sub;
        u.username = token.username;
        u.isAdmin = token.isAdmin;
        u.mustChangePassword = token.mustChangePassword;
        u.tenantId = token.tenantId ?? null;
        u.tenantSlug = token.tenantSlug ?? null;
        // platform super-admin = admin with no tenant
        u.isSuperAdmin = !!token.isAdmin && !token.tenantId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
