"use server";

import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { reconciliationRuns, files, tenants, exceptions } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { saveUpload, readUpload } from "@/lib/storage";
import { parseWorkbook } from "@/lib/xlsx";
import { executeRun } from "@/modules/ar-reconciliation/run";
import type { ColumnMapping } from "@/modules/ar-reconciliation/ledger-mapping";

export type FormState = { error?: string };

const OK_EXT = /\.(xlsx|xls|csv)$/i;
const MAX_BYTES = 15 * 1024 * 1024;

async function readFile(f: FormDataEntryValue | null): Promise<{ name: string; buf: Buffer } | null> {
  if (!f || typeof f === "string") return null;
  const file = f as File;
  if (!file.name || file.size === 0) return null;
  return { name: file.name, buf: Buffer.from(await file.arrayBuffer()) };
}

export async function createRun(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." };
  if (!(await can(user, "ar-reconciliation.run.create"))) return { error: "You don't have permission to run reconciliations." };

  // Resolve the company (tenant). Super-admins choose one; company users use their own.
  let tenantId = user.tenantId;
  if (user.isSuperAdmin) {
    tenantId = String(fd.get("companyId") || "");
    if (!tenantId) return { error: "Select a company for this run." };
    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!t || !t.isActive) return { error: "Choose an active company." };
  }
  if (!tenantId) return { error: "No company context for this run." };

  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) return { error: "Enter a name for this reconciliation." };

  const statement = await readFile(fd.get("statement"));
  const customer = await readFile(fd.get("customer"));
  if (!statement || !customer) return { error: "Upload both the Statement of Account and the Customer Ledger." };
  for (const f of [statement, customer]) {
    if (!OK_EXT.test(f.name)) return { error: "Files must be .xlsx, .xls or .csv." };
    if (f.buf.length > MAX_BYTES) return { error: "Each file must be under 15 MB." };
  }

  // Create a draft run + store the files, then send the user to confirm the mapping.
  const [run] = await db
    .insert(reconciliationRuns)
    .values({ tenantId, name, status: "draft", createdBy: user.id })
    .returning({ id: reconciliationRuns.id });

  try {
    const sSaved = await saveUpload(tenantId, statement.name, statement.buf);
    const cSaved = await saveUpload(tenantId, customer.name, customer.buf);
    const [sFile] = await db
      .insert(files)
      .values({ tenantId, kind: "statement", originalName: statement.name, sizeBytes: sSaved.size, sha256: sSaved.sha256, storageKey: sSaved.storageKey, uploadedBy: user.id })
      .returning({ id: files.id });
    const [cFile] = await db
      .insert(files)
      .values({ tenantId, kind: "customer", originalName: customer.name, sizeBytes: cSaved.size, sha256: cSaved.sha256, storageKey: cSaved.storageKey, uploadedBy: user.id })
      .returning({ id: files.id });
    await db.update(reconciliationRuns).set({ statementFileId: sFile.id, customerFileId: cFile.id }).where(eq(reconciliationRuns.id, run.id));
  } catch {
    await db.update(reconciliationRuns).set({ status: "failed", error: "Upload failed." }).where(eq(reconciliationRuns.id, run.id));
    return { error: "Could not save the uploaded files." };
  }

  redirect(`/ar-reconciliation/${run.id}/mapping`);
}

export async function confirmMapping(input: {
  runId: string;
  statement: ColumnMapping;
  customer: ColumnMapping;
}): Promise<{ error?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." };
  if (!(await can(user, "ar-reconciliation.run.create"))) return { error: "No permission." };

  const [run] = await db
    .select({ id: reconciliationRuns.id, tenantId: reconciliationRuns.tenantId, statementFileId: reconciliationRuns.statementFileId, customerFileId: reconciliationRuns.customerFileId })
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.id, input.runId))
    .limit(1);
  if (!run) return { error: "Run not found." };
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) return { error: "Not allowed." };
  if (!run.statementFileId || !run.customerFileId) return { error: "Uploaded files are missing." };

  const fileRows = await db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(inArray(files.id, [run.statementFileId, run.customerFileId]));
  const sKey = fileRows.find((f) => f.id === run.statementFileId)?.storageKey;
  const cKey = fileRows.find((f) => f.id === run.customerFileId)?.storageKey;
  if (!sKey || !cKey) return { error: "Uploaded files are no longer available." };

  await db.update(reconciliationRuns).set({ status: "running" }).where(eq(reconciliationRuns.id, run.id));
  try {
    const summary = await executeRun({
      runId: run.id,
      tenantId: run.tenantId,
      statementRows: parseWorkbook(await readUpload(sKey)),
      customerRows: parseWorkbook(await readUpload(cKey)),
      statementMapping: input.statement,
      customerMapping: input.customer,
    });
    await writeAudit({
      action: "reconciliation.run",
      entity: "reconciliation_run",
      entityId: run.id,
      tenantId: run.tenantId,
      metadata: { autoMatchPct: summary.autoMatchPct, exceptions: summary.exceptionCount },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconciliation failed.";
    await db.update(reconciliationRuns).set({ status: "failed", error: message }).where(eq(reconciliationRuns.id, run.id));
    return { error: message };
  }

  redirect(`/ar-reconciliation/${run.id}`);
}

export type ExceptionStatus = "open" | "approved" | "adjusted" | "resolved";

export async function resolveException(input: {
  exceptionId: string;
  status: ExceptionStatus;
  note?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." };

  const [ex] = await db
    .select({ tenantId: exceptions.tenantId, runId: exceptions.runId })
    .from(exceptions)
    .where(eq(exceptions.id, input.exceptionId))
    .limit(1);
  if (!ex) return { error: "Exception not found." };
  if (!user.isSuperAdmin && ex.tenantId !== user.tenantId) return { error: "Not allowed." };

  const need = input.status === "adjusted" ? "ar-reconciliation.exception.adjust" : "ar-reconciliation.exception.approve";
  if (!(await can(user, need))) return { error: "You don't have permission for that action." };

  await db
    .update(exceptions)
    .set({
      status: input.status,
      resolvedBy: input.status === "open" ? null : user.id,
      resolutionNote: input.note?.slice(0, 1000) ?? null,
    })
    .where(eq(exceptions.id, input.exceptionId));

  await writeAudit({
    action: "reconciliation.exception." + input.status,
    entity: "exception",
    entityId: input.exceptionId,
    tenantId: ex.tenantId,
  });
  revalidatePath(`/ar-reconciliation/${ex.runId}`);
  return { ok: true };
}
