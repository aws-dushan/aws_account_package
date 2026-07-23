"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/jwt";
import { apiFetch, ApiError } from "@/lib/api";

export type ChangeState = { error?: string };

export async function changePassword(
  _prev: ChangeState,
  formData: FormData,
): Promise<ChangeState> {
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current) return { error: "Enter your current password." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  try {
    const res = await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: password }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: j.error ?? "Could not change password." };
    }
    const data = (await res.json()) as { token?: string };
    if (data.token) {
      (await cookies()).set(AUTH_COOKIE, data.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
    }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not change password." };
  }

  redirect("/dashboard");
}
