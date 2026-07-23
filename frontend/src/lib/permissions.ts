import { apiGetOrNull } from "@/lib/api";
import type { SessionUser } from "@/lib/session";

type Me = {
  tenantSlug: string | null;
  permissions: string[];
};

/** The current user's granted permission keys, from the API. */
export async function getUserPermissionKeys(_userId?: string): Promise<string[]> {
  const me = await apiGetOrNull<Me>("/api/auth/me");
  return me?.permissions ?? [];
}

/** The current user's full profile (includes tenantSlug + permission keys). */
export async function getMe(): Promise<Me | null> {
  return apiGetOrNull<Me>("/api/auth/me");
}

/**
 * Can this user perform `key`? Super-admins (ERP team) always can. Otherwise the key
 * must be present in their granted set. Pass a preloaded `grantedKeys` to avoid a round-trip.
 */
export async function can(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  key: string,
  grantedKeys?: string[],
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const keys = grantedKeys ?? (await getUserPermissionKeys(user.id));
  return keys.includes(key);
}

/** Throw-style guard for server actions. */
export async function requirePermission(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  key: string,
): Promise<void> {
  if (!(await can(user, key))) {
    throw new Error(`Forbidden: missing permission "${key}"`);
  }
}
