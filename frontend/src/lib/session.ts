import { cookies } from "next/headers";
import { AUTH_COOKIE, decodeJwt, claimsToUser } from "./jwt";

export type SessionUser = {
  id: string;
  username: string;
  name?: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
};

/** Read the current user from the JWT cookie (server-side), or null. No network call —
 *  the token's claims are trusted for display/gating; the API re-verifies every request. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const claims = decodeJwt(token);
  if (!claims) return null;
  const u = claimsToUser(claims);
  if (!u.id) return null;
  return { ...u, tenantSlug: null };
}
