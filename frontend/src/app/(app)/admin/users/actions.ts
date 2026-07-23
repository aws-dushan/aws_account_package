"use server";

import { revalidatePath } from "next/cache";
import { apiPost, apiPut, ApiError } from "@/lib/api";
import { isValidPermissionKey } from "@/modules/registry";

export type FormState = { error?: string; ok?: string; tempPassword?: string };

export async function createUser(_prev: FormState, fd: FormData): Promise<FormState> {
  const username = String(fd.get("username") ?? "").trim();
  const displayName = String(fd.get("displayName") ?? "").trim();
  const assignment = String(fd.get("assignment") ?? "");

  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username))
    return { error: "Username must be 3–64 chars (letters, numbers, _ . -)." };
  if (displayName.length < 2) return { error: "Enter a display name." };
  if (!assignment) return { error: "Select a company (or Platform super-admin)." };

  try {
    const res = await apiPost<{ tempPassword: string }>("/api/users", { displayName, username, assignment });
    revalidatePath("/admin/users");
    return { ok: `Created "${username}".`, tempPassword: res.tempPassword };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not create the user." };
  }
}

export async function setUserActive(id: string, isActive: boolean): Promise<void> {
  try {
    await apiPost(`/api/users/${id}/active`, { isActive });
  } catch {
    /* surfaced on refresh */
  }
  revalidatePath("/admin/users");
}

export async function resetUserPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = String(fd.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };
  try {
    const res = await apiPost<{ tempPassword: string }>(`/api/users/${userId}/reset-password`);
    return { ok: "Temporary password set.", tempPassword: res.tempPassword };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not reset the password." };
  }
}

export async function setUserPermissions(_prev: FormState, fd: FormData): Promise<FormState> {
  const userId = String(fd.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  const keys = [...new Set(fd.getAll("perm").map(String).filter(isValidPermissionKey))];
  try {
    await apiPut(`/api/users/${userId}/permissions`, { keys });
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not save permissions." };
  }
  revalidatePath(`/admin/users/${userId}`);
  return { ok: `Saved ${keys.length} permission${keys.length === 1 ? "" : "s"}.` };
}
