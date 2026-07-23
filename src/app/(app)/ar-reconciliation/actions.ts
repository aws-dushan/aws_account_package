"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns, files, tenants } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage";
import { parseWorkbook } from "@/lib/xlsx";
import { executeRun } from "@/modules/ar-reconciliation/run";

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
  const periodStart = String(fd.get("periodStart") || "") || null;
  const periodEnd = String(fd.get("periodEnd") || "") || null;

  const statement = await readFile(fd.get("statement"));
  const customer = await readFile(fd.get("customer"));
  if (!statement || !customer) return { error: "Upload both the Statement of Account and the Customer Ledger." };
  for (const f of [statement, customer]) {
    if (!OK_EXT.test(f.name)) return { error: "Files must be .xlsx, .xls or .csv." };
    if (f.buf.length > MAX_BYTES) return { error: "Each file must be under 15 MB." };
  }

  // Create the run (running), then store files + execute.
  const [run] = await db
    .insert(reconciliationRuns)
    .values({ tenantId, name, periodStart, periodEnd, status: "running", createdBy: user.id })
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

    const summary = await executeRun({
      runId: run.id,
      tenantId,
      statementRows: parseWorkbook(statement.buf),
      customerRows: parseWorkbook(customer.buf),
      periodEnd,
    });

    await writeAudit({
      action: "reconciliation.run",
      entity: "reconciliation_run",
      entityId: run.id,
      tenantId,
      metadata: { name, autoMatchPct: summary.autoMatchPct, exceptions: summary.exceptionCount },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconciliation failed.";
    await db.update(reconciliationRuns).set({ status: "failed", error: message }).where(eq(reconciliationRuns.id, run.id));
    return { error: message };
  }

  redirect(`/ar-reconciliation/${run.id}`);
}
