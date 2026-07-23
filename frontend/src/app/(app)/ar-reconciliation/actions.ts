"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/session";
import { apiFetch, apiPost, ApiError } from "@/lib/api";

export type FormState = { error?: string };
export type ExceptionStatus = "open" | "approved" | "adjusted" | "resolved";

const OK_EXT = /\.(xlsx|xls|csv|pdf)$/i;
const MAX_BYTES = 15 * 1024 * 1024;

/** Create a reconciliation run — uploads both ledgers to the API (multipart). */
export async function createRun(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." };

  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) return { error: "Enter a name for this reconciliation." };

  const statement = fd.get("statement");
  const customer = fd.get("customer");
  if (!(statement instanceof File) || statement.size === 0 || !(customer instanceof File) || customer.size === 0) {
    return { error: "Upload both the Statement of Account and the Customer Ledger." };
  }
  for (const f of [statement, customer]) {
    if (!OK_EXT.test(f.name)) return { error: "Files must be .xlsx, .xls, .csv or .pdf." };
    if (f.size > MAX_BYTES) return { error: "Each file must be under 15 MB." };
  }

  const body = new FormData();
  body.set("name", name);
  body.set("statement", statement);
  body.set("customer", customer);
  // Super-admins pick a company; company users are pinned to their own tenant server-side.
  if (user.isSuperAdmin) {
    const companyId = String(fd.get("companyId") || "");
    if (!companyId) return { error: "Select a company for this run." };
    body.set("tenantId", companyId);
  }

  let runId: string;
  try {
    const res = await apiFetch("/api/runs", { method: "POST", body });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: j.error ?? "Reconciliation failed to start." };
    }
    const data = (await res.json()) as { id: string };
    runId = data.id;
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Reconciliation failed to start." };
  }

  redirect(`/ar-reconciliation/${runId}`);
}

/** On-demand AI commentary for a run's exceptions. */
export async function generateInsights(runId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await apiPost(`/api/runs/${runId}/ai-insights`);
    revalidatePath(`/ar-reconciliation/${runId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "AI insight generation failed." };
  }
}

/** Confirm or reject an AI-suggested match. */
export async function confirmSuggestion(input: { exceptionId: string; accept: boolean }): Promise<{ ok?: boolean; error?: string }> {
  try {
    await apiPost(`/api/exceptions/${input.exceptionId}/ai-match`, { accept: input.accept });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not update the match." };
  }
}

/** Approve / adjust / resolve / reopen an exception. */
export async function resolveException(input: {
  exceptionId: string;
  status: ExceptionStatus;
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    await apiPost(`/api/exceptions/${input.exceptionId}/resolve`, { status: input.status, note: input.note });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "Could not update the exception." };
  }
}
