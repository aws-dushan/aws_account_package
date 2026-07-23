import { auth } from "@/auth";

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

/** Read the current user from the session (server-side), or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user as unknown as Partial<SessionUser>;
  return {
    id: u.id ?? "",
    username: u.username ?? "",
    name: u.name,
    isAdmin: !!u.isAdmin,
    isSuperAdmin: !!u.isSuperAdmin,
    mustChangePassword: !!u.mustChangePassword,
    tenantId: u.tenantId ?? null,
    tenantSlug: u.tenantSlug ?? null,
  };
}
