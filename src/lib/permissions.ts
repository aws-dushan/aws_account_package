import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPermissions } from "@/db/schema";
import type { SessionUser } from "@/lib/session";

/** All permission keys granted to a user (empty for a fresh non-admin user). */
export async function getUserPermissionKeys(userId: string): Promise<string[]> {
  const rows = await db
    .select({ key: userPermissions.permissionKey })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  return rows.map((r) => r.key);
}

/**
 * Can this user perform `key`? Super-admins (ERP team) always can. Otherwise the
 * key must be present in their granted set. Pass a preloaded `grantedKeys` to
 * avoid a DB round-trip (e.g. when checking several keys for nav rendering).
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
