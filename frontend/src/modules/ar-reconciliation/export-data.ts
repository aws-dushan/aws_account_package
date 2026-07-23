import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns, ledgerLines, matches, exceptions, tenants } from "@/db/schema";
import { CATEGORY_LABEL } from "./labels";
import type { ExportData, ExportLine } from "./export";

/** Assemble the full report dataset for a run (shared by the Excel + PDF exports). */
export async function assembleExportData(runId: string): Promise<{ tenantId: string; status: string; data: ExportData } | null> {
  const [run] = await db
    .select({
      id: reconciliationRuns.id,
      name: reconciliationRuns.name,
      status: reconciliationRuns.status,
      tenantId: reconciliationRuns.tenantId,
      autoMatchPct: reconciliationRuns.autoMatchPct,
      matchedValue: reconciliationRuns.matchedValue,
      company: tenants.name,
    })
    .from(reconciliationRuns)
    .leftJoin(tenants, eq(reconciliationRuns.tenantId, tenants.id))
    .where(eq(reconciliationRuns.id, runId))
    .limit(1);
  if (!run) return null;

  const lines = await db.select().from(ledgerLines).where(eq(ledgerLines.runId, run.id));
  const matchRows = await db.select({ id: matches.id, ruleCode: matches.ruleCode }).from(matches).where(eq(matches.runId, run.id));
  const exRows = await db
    .select({ ledgerLineId: exceptions.ledgerLineId, category: exceptions.categoryCode, severity: exceptions.severity, amount: exceptions.amount, reference: ledgerLines.reference, description: ledgerLines.description, side: ledgerLines.side })
    .from(exceptions)
    .leftJoin(ledgerLines, eq(exceptions.ledgerLineId, ledgerLines.id))
    .where(eq(exceptions.runId, run.id));

  const ruleByMatch = new Map(matchRows.map((m) => [m.id, m.ruleCode]));
  const exByLine = new Map(exRows.filter((x) => x.ledgerLineId).map((x) => [x.ledgerLineId as string, x]));

  const exportLines: ExportLine[] = lines.map((l) => {
    const ex = exByLine.get(l.id);
    let dispositionLabel: string;
    let severity: string;
    if (ex) {
      dispositionLabel = CATEGORY_LABEL[ex.category] ?? ex.category;
      severity = ex.severity;
    } else if (l.matchId) {
      dispositionLabel = `Matched (${ruleByMatch.get(l.matchId) ?? "R"})`;
      severity = "g";
    } else {
      dispositionLabel = "Reversed / netted";
      severity = "n";
    }
    return {
      side: l.side === "statement" ? "Statement" : "Customer",
      reference: l.reference ?? "",
      description: l.description ?? "",
      debit: Number(l.debit),
      credit: Number(l.credit),
      amount: Number(l.amount),
      dispositionLabel,
      severity,
    };
  });

  const catCounts = new Map<string, number>();
  for (const x of exRows) catCounts.set(x.category, (catCounts.get(x.category) ?? 0) + 1);

  const data: ExportData = {
    run: {
      name: run.name,
      company: run.company,
      autoMatchPct: run.autoMatchPct != null ? Number(run.autoMatchPct) : null,
      matchedValue: run.matchedValue != null ? Number(run.matchedValue) : null,
      status: run.status,
    },
    counts: { lines: lines.length, matches: matchRows.length, exceptions: exRows.length },
    categoryBreakdown: [...catCounts.entries()].map(([code, count]) => ({ code, count })),
    lines: exportLines,
    exceptions: exRows.map((x) => ({ reference: x.reference ?? "", description: x.description ?? "", side: x.side === "statement" ? "Statement" : x.side === "customer" ? "Customer" : "", category: x.category, severity: x.severity, amount: Number(x.amount) })),
  };

  return { tenantId: run.tenantId, status: run.status, data };
}
