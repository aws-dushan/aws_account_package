import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns, ledgerLines, matches, exceptions, tenants } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { CATEGORY_LABEL } from "@/modules/ar-reconciliation/labels";
import { buildRunWorkbook, type ExportData, type ExportLine } from "@/modules/ar-reconciliation/export";

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await can(user, "ar-reconciliation.report.export"))) return new Response("Forbidden", { status: 403 });

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
    .where(eq(reconciliationRuns.id, params.runId))
    .limit(1);

  if (!run) return new Response("Not found", { status: 404 });
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) return new Response("Not found", { status: 404 });

  const lines = await db.select().from(ledgerLines).where(eq(ledgerLines.runId, run.id));
  const matchRows = await db.select({ id: matches.id, ruleCode: matches.ruleCode }).from(matches).where(eq(matches.runId, run.id));
  const exRows = await db
    .select({
      ledgerLineId: exceptions.ledgerLineId,
      category: exceptions.categoryCode,
      severity: exceptions.severity,
      amount: exceptions.amount,
      reference: ledgerLines.reference,
      description: ledgerLines.description,
      side: ledgerLines.side,
    })
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
    exceptions: exRows.map((x) => ({
      reference: x.reference ?? "",
      description: x.description ?? "",
      side: x.side === "statement" ? "Statement" : x.side === "customer" ? "Customer" : "",
      category: x.category,
      severity: x.severity,
      amount: Number(x.amount),
    })),
  };

  const buffer = await buildRunWorkbook(data);
  await writeAudit({ action: "reconciliation.export", entity: "reconciliation_run", entityId: run.id, tenantId: run.tenantId });

  const safeName = run.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "reconciliation";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
