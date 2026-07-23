"use server";

import { revalidatePath } from "next/cache";
import { apiPost, ApiError } from "@/lib/api";

export type FormState = { error?: string; ok?: string };

export async function createCompany(_prev: FormState, fd: FormData): Promise<FormState> {
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter a company name (at least 2 characters)." };

  try {
    await apiPost("/api/companies", { name });
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not create the company." };
  }
  revalidatePath("/admin/companies");
  revalidatePath("/admin/users");
  return { ok: `Created company "${name}".` };
}

export async function setCompanyActive(id: string, isActive: boolean): Promise<void> {
  try {
    await apiPost(`/api/companies/${id}/active`, { isActive });
  } catch {
    /* surfaced on refresh */
  }
  revalidatePath("/admin/companies");
}
