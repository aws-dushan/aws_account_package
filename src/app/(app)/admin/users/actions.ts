"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, userPermissions } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { isValidPermissionKey } from "@/modules/registry";

export type FormState = { error?: string; ok?: string; tempPassword?: string };

const PLATFORM = "__platform__";

function tempPassword(): string {
  return `AwsAcc-${randomBytes(4).toString("hex")}`;
}

export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await currentUser();
  if (!admin?.isSuperAdmin) return { error: "Only a super-admin can create users." };

  const username = String(fd.get("username") ?? "").trim();
  const displayName = String(fd.get("displayName") ?? "").trim();
  const assignment = String(fd.get("assignment") ?? "");

  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username))
    return { error: "Username must be 3–64 chars (letters, numbers, _ . -)." };
  if (displayName.length < 2) return { error: "Enter a display name." };
  if (!assignment) return { error: "Select a company (or Platform super-admin)." };

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) return { error: `Username "${username}" is already taken.` };

  const isPlatform = assignment === PLATFORM;
  const pw = tempPassword();
  await db.insert(users).values({
    username,
    displayName,
    tenantId: isPlatform ? null : assignment,
    isAdmin: isPlatform, // platform account = ERP-team super-admin
    isActive: true,
    mustChangePassword: true,
    passwordHash: await hashPassword(pw),
  });

  revalidatePath("/admin/users");
  return { ok: `Created "${username}".`, tempPassword: pw };
}

export async function setUserActive(id: string, isActive: boolean): Promise<void> {
  const admin = await currentUser();
  if (!admin?.isSuperAdmin) return;
  if (admin.id === id) return; // don't disable yourself
  await db.update(users).set({ isActive }).where(eq(users.id, id));
  revalidatePath("/admin/users");
}

export async function resetUserPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await currentUser();
  if (!admin?.isSuperAdmin) return { error: "Not allowed." };
  const userId = String(fd.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };
  const pw = tempPassword();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(pw), mustChangePassword: true })
    .where(eq(users.id, userId));
  return { ok: "Temporary password set.", tempPassword: pw };
}

export async function setUserPermissions(_prev: FormState, fd: FormData): Promise<FormState> {
  const admin = await currentUser();
  if (!admin?.isSuperAdmin) return { error: "Not allowed." };
  const userId = String(fd.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  const keys = fd.getAll("perm").map(String).filter(isValidPermissionKey);
  const unique = [...new Set(keys)];

  await db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    if (unique.length) {
      await tx.insert(userPermissions).values(unique.map((k) => ({ userId, permissionKey: k })));
    }
  });

  revalidatePath(`/admin/users/${userId}`);
  return { ok: `Saved ${unique.length} permission${unique.length === 1 ? "" : "s"}.` };
}
