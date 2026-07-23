/* Verify the Excel export builds from a persisted run. Run: npx tsx scripts/export-check.ts */
import "dotenv/config";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, reconciliationRuns, ledgerLines, matches, exceptions } from "../src/db/schema";
import { executeRun } from "../src/modules/ar-reconciliation/run";
import { buildRunWorkbook, type ExportLine } from "../src/modules/ar-reconciliation/export";
import { CATEGORY_LABEL } from "../src/modules/ar-reconciliation/labels";

const statementRows = [
  ["Reference", "Description", "Debit", "Credit"],
  ["SI30-2279", "Tax invoice", "207.90", ""],
  ["SI30-2263", "Tax invoice", "1743.63", ""],
  ["QRV20-12909", "Receipt", "", "10500.00"],
];
const customerRows = [
  ["Doc No", "Narration", "Amount"],
  ["SI30-2279", "Tax invoice", "-207.90"],
  ["SI30-2263", "Tax invoice", "-1477.56"],
  ["CASH-WH-0065", "Cash acct", "40271.13"],
];

let failures = 0;
const assert = (n: string, c: boolean, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) failures++; };

async function main() {
  const [co] = await db.select().from(tenants).where(eq(tenants.slug, "aws-distribution")).limit(1);
  const [run] = await db.insert(reconciliationRuns)
    .values({ tenantId: co.id, name: "Export Test", status: "running" })
    .returning({ id: reconciliationRuns.id });

  try {
    await executeRun({ runId: run.id, tenantId: co.id, statementRows, customerRows });
    const lines = await db.select().from(ledgerLines).where(eq(ledgerLines.runId, run.id));
    const matchRows = await db.select({ id: matches.id, ruleCode: matches.ruleCode }).from(matches).where(eq(matches.runId, run.id));
    const exRows = await db.select({ ledgerLineId: exceptions.ledgerLineId, category: exceptions.categoryCode, severity: exceptions.severity, amount: exceptions.amount })
      .from(exceptions).where(eq(exceptions.runId, run.id));
    const exByLine = new Map(exRows.filter((x) => x.ledgerLineId).map((x) => [x.ledgerLineId as string, x]));
    const ruleByMatch = new Map(matchRows.map((m) => [m.id, m.ruleCode]));

    const exportLines: ExportLine[] = lines.map((l) => {
      const ex = exByLine.get(l.id);
      return {
        side: l.side, reference: l.reference ?? "", description: l.description ?? "",
        debit: Number(l.debit), credit: Number(l.credit), amount: Number(l.amount),
        dispositionLabel: ex ? CATEGORY_LABEL[ex.category] : l.matchId ? `Matched (${ruleByMatch.get(l.matchId)})` : "Netted",
        severity: ex ? ex.severity : l.matchId ? "g" : "n",
      };
    });

    const buf = await buildRunWorkbook({
      run: { name: "Export Test", company: co.name, autoMatchPct: 50, matchedValue: 207.9, status: "completed" },
      counts: { lines: lines.length, matches: matchRows.length, exceptions: exRows.length },
      categoryBreakdown: [], lines: exportLines,
      exceptions: exRows.map((x) => ({ reference: "", description: "", side: "", category: x.category, severity: x.severity, amount: Number(x.amount) })),
    });

    assert("workbook buffer produced", buf.length > 3000, `${buf.length} bytes`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    assert("has Summary/Detail/Exceptions sheets", ["Summary", "Detail", "Exceptions"].every((n) => !!wb.getWorksheet(n)));
    const detail = wb.getWorksheet("Detail")!;
    assert("Detail has a row per ledger line", detail.rowCount - 1 === lines.length, `rows ${detail.rowCount - 1} vs ${lines.length}`);
    const statusCell = detail.getRow(2).getCell(7);
    assert("status cell is colour-filled", !!(statusCell.fill && (statusCell.fill as ExcelJS.FillPattern).fgColor));
  } finally {
    await db.delete(reconciliationRuns).where(eq(reconciliationRuns.id, run.id));
  }

  console.log(`\n${failures === 0 ? "EXPORT CHECK PASSED ✓" : `${failures} FAILED ✗`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
