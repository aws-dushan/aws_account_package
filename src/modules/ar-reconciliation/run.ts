import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { ledgerLines, matches, matchLines, exceptions, reconciliationRuns, files } from "../../db/schema";
import { autoDetectMapping, applyMapping, mappingGaps, type ColumnMapping } from "./ledger-mapping";
import { reconcile } from "./engine/engine";
import { resolveMapping } from "./mapping-resolver";
import { generateExceptionInsights } from "./ai-enrich";
import { readUpload } from "../../lib/storage";
import { parseWorkbook } from "../../lib/xlsx";

function toDate(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** Reconciliation stages, in order — the UI stepper renders these. */
export const RUN_STAGES = ["Reading files", "Resolving columns", "Matching", "Saving results", "AI insights", "Completed"] as const;

async function setStage(runId: string, stage: string) {
  await db.update(reconciliationRuns).set({ stage }).where(eq(reconciliationRuns.id, runId));
}

/**
 * Map both ledgers to canonical lines, reconcile, and persist the full result
 * (ledger_lines, matches, match_lines, exceptions) + run summary — in one transaction.
 * Throws if required columns can't be mapped (caller marks the run failed).
 */
export async function executeRun(params: {
  runId: string;
  tenantId: string;
  statementRows: string[][];
  customerRows: string[][];
  periodEnd?: string | null;
  /** Explicit mappings (from the confirm step). Falls back to auto-detection. */
  statementMapping?: ColumnMapping;
  customerMapping?: ColumnMapping;
}) {
  const { runId, tenantId, statementRows, customerRows, periodEnd } = params;

  const sMap = params.statementMapping ?? autoDetectMapping(statementRows);
  const cMap = params.customerMapping ?? autoDetectMapping(customerRows);
  const gaps = [...new Set([...mappingGaps(sMap), ...mappingGaps(cMap)])];
  if (gaps.length) {
    throw new Error(`Could not map required column(s): ${gaps.join(", ")}. Check the file headers.`);
  }

  await setStage(runId, "Matching");
  const sLines = applyMapping(statementRows, sMap, "statement");
  const cLines = applyMapping(customerRows, cMap, "customer");
  const result = reconcile(sLines, cLines, { amountTolerance: 1, fuzzyThreshold: 0.8, periodEnd });

  await setStage(runId, "Saving results");
  await db.transaction(async (tx) => {
    const keyToId = new Map<string, string>();
    if (result.lines.length) {
      const inserted = await tx
        .insert(ledgerLines)
        .values(
          result.lines.map((l) => ({
            runId,
            tenantId,
            side: l.side,
            reference: l.reference.slice(0, 200),
            normRef: l.normRef.slice(0, 200),
            txnDate: toDate(l.date),
            description: l.description.slice(0, 400),
            debit: String(l.debit),
            credit: String(l.credit),
            amount: String(l.signed),
            sourceRow: l.sourceRow ?? null,
          })),
        )
        .returning({ id: ledgerLines.id });
      result.lines.forEach((l, i) => keyToId.set(l.key, inserted[i].id));
    }

    for (const m of result.matches) {
      const [mm] = await tx
        .insert(matches)
        .values({ runId, tenantId, ruleCode: m.ruleCode, method: "rule", confidence: String(m.confidence), status: "auto" })
        .returning({ id: matches.id });
      const lineIds = [...m.statementKeys, ...m.customerKeys].map((k) => keyToId.get(k)).filter((x): x is string => !!x);
      if (lineIds.length) {
        await tx.insert(matchLines).values(lineIds.map((id) => ({ matchId: mm.id, ledgerLineId: id })));
        await tx.update(ledgerLines).set({ matchId: mm.id }).where(inArray(ledgerLines.id, lineIds));
      }
    }

    if (result.exceptions.length) {
      await tx.insert(exceptions).values(
        result.exceptions.map((e) => ({
          runId,
          tenantId,
          ledgerLineId: keyToId.get(e.key) ?? null,
          categoryCode: e.categoryCode,
          severity: e.severity,
          amount: String(e.amount),
          status: "open",
        })),
      );
    }

    await tx
      .update(reconciliationRuns)
      .set({
        status: "completed",
        autoMatchPct: String(result.summary.autoMatchPct),
        matchedValue: String(result.summary.matchedValue),
        completedAt: new Date(),
      })
      .where(eq(reconciliationRuns.id, runId));
  });

  return result.summary;
}

/**
 * Full job for a stored run: read its files, resolve column mappings without user
 * confirmation (learned → auto → AI), then reconcile + persist.
 */
export async function processRun(runId: string) {
  const [run] = await db
    .select({ tenantId: reconciliationRuns.tenantId, statementFileId: reconciliationRuns.statementFileId, customerFileId: reconciliationRuns.customerFileId })
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found.");
  if (!run.statementFileId || !run.customerFileId) throw new Error("Uploaded files are missing.");

  await setStage(runId, "Reading files");
  const fileRows = await db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(inArray(files.id, [run.statementFileId, run.customerFileId]));
  const sKey = fileRows.find((f) => f.id === run.statementFileId)?.storageKey;
  const cKey = fileRows.find((f) => f.id === run.customerFileId)?.storageKey;
  if (!sKey || !cKey) throw new Error("Uploaded files are no longer available.");

  const statementRows = parseWorkbook(await readUpload(sKey));
  const customerRows = parseWorkbook(await readUpload(cKey));

  await setStage(runId, "Resolving columns");
  const s = await resolveMapping(run.tenantId, statementRows, "statement");
  const c = await resolveMapping(run.tenantId, customerRows, "customer");

  const summary = await executeRun({
    runId,
    tenantId: run.tenantId,
    statementRows,
    customerRows,
    statementMapping: s.mapping,
    customerMapping: c.mapping,
  });

  // Stage 6 — AI commentary (best-effort; skipped when AI isn't configured).
  try {
    await setStage(runId, "AI insights");
    await generateExceptionInsights(runId);
  } catch {
    /* AI optional — do not fail the run */
  }

  await setStage(runId, "Completed");
  return { summary, mappingSource: { statement: s.source, customer: c.source } };
}
