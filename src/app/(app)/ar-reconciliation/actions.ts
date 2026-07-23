"use server";

import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { reconciliationRuns, files, tenants, exceptions, ledgerLines, matches, matchLines } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage";
import { isQueueEnabled, enqueueReconcile } from "@/lib/queue";
import { AiNotConfiguredError } from "@/lib/ai";
import { processRun } from "@/modules/ar-reconciliation/run";
import { generateExceptionInsights } from "@/modules/ar-reconciliation/ai-enrich";

export type FormState = { error?: string };

const OK_EXT = /\.(xlsx|xls|csv|pdf)$/i;
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
    if (!OK_EXT.test(f.name)) return { error: "Files must be .xlsx, .xls, .csv or .pdf." };
    if (f.buf.length > MAX_BYTES) return { error: "Each file must be under 15 MB." };
  }

  // Create the run, store the files, then reconcile (mapping is resolved automatically).
  const [run] = await db
    .insert(reconciliationRuns)
    .values({ tenantId, name, status: "running", createdBy: user.id })
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

    if (isQueueEnabled()) {
      // Background: the worker picks it up; the results page shows live progress.
      await db.update(reconciliationRuns).set({ status: "queued", stage: "Queued" }).where(eq(reconciliationRuns.id, run.id));
      await enqueueReconcile(run.id);
    } else {
      // Synchronous fallback (no Redis configured).
      const { summary } = await processRun(run.id);
      await writeAudit({
        action: "reconciliation.run",
        entity: "reconciliation_run",
        entityId: run.id,
        tenantId,
        metadata: { name, autoMatchPct: summary.autoMatchPct, exceptions: summary.exceptionCount },
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconciliation failed.";
    await db.update(reconciliationRuns).set({ status: "failed", error: message }).where(eq(reconciliationRuns.id, run.id));
    return { error: message };
  }

  redirect(`/ar-reconciliation/${run.id}`);
}

export async function generateInsights(runId: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." };
  const [run] = await db.select({ tenantId: reconciliationRuns.tenantId }).from(reconciliationRuns).where(eq(reconciliationRuns.id, runId)).limit(1);
  if (!run) return { error: "Run not found." };
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) return { error: "Not allowed." };
  if (!(await can(user, "ar-reconciliation.view"))) return { error: "No permission." };

  try {
    const n = await generateExceptionInsights(runId);
    await writeAudit({ action: "reconciliation.ai_insights", entity: "reconciliation_run", entityId: runId, tenantId: run.tenantId, metadata: { count: n } });
    revalidatePath(`/ar-reconciliation/${runId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return { error: "Configure a reasoning model in Admin → AI Settings first." };
    return { error: "AI insight generation failed. Check the AI provider configuration." };
  }
}

export async function confirmSuggestion(input: { exceptionId: string; accept: boolean }): Promise<{ ok?: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in." };

  const [ex] = await db.select({ tenantId: exceptions.tenantId, runId: exceptions.runId, lineId: exceptions.ledgerLineId }).from(exceptions).where(eq(exceptions.id, input.exceptionId)).limit(1);
  if (!ex) return { error: "Exception not found." };
  if (!user.isSuperAdmin && ex.tenantId !== user.tenantId) return { error: "Not allowed." };
  if (!(await can(user, "ar-reconciliation.exception.approve"))) return { error: "You don't have permission to confirm matches." };
  if (!ex.lineId) return { error: "No linked line." };

  const [line] = await db.select({ matchId: ledgerLines.matchId }).from(ledgerLines).where(eq(ledgerLines.id, ex.lineId)).limit(1);
  const matchId = line?.matchId;
  if (!matchId) return { error: "No suggested match to confirm." };

  const links = await db.select({ lineId: matchLines.ledgerLineId }).from(matchLines).where(eq(matchLines.matchId, matchId));
  const lineIds = links.map((l) => l.lineId);
  const exRows = await db.select({ id: exceptions.id }).from(exceptions).where(inArray(exceptions.ledgerLineId, lineIds));
  const exIds = exRows.map((r) => r.id);

  if (input.accept) {
    await db.update(matches).set({ status: "user_confirmed" }).where(eq(matches.id, matchId));
    await db.update(exceptions).set({ status: "resolved", resolvedBy: user.id }).where(inArray(exceptions.id, exIds));
  } else {
    await db.update(ledgerLines).set({ matchId: null }).where(inArray(ledgerLines.id, lineIds));
    await db.delete(matches).where(eq(matches.id, matchId)); // cascades match_lines
    await db.update(exceptions).set({ status: "open", aiExplanation: null, aiRecommendation: null }).where(inArray(exceptions.id, exIds));
  }

  await writeAudit({ action: input.accept ? "reconciliation.ai_match.confirm" : "reconciliation.ai_match.reject", entity: "exception", entityId: input.exceptionId, tenantId: ex.tenantId });
  revalidatePath(`/ar-reconciliation/${ex.runId}`);
  return { ok: true };
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
