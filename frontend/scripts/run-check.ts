/* End-to-end persistence check: two formats -> map -> reconcile -> DB. Run: npx tsx scripts/run-check.ts */
import "dotenv/config";
import { eq, count } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, reconciliationRuns, ledgerLines, matches, exceptions } from "../src/db/schema";
import { executeRun } from "../src/modules/ar-reconciliation/run";

// Statement in debit/credit format.
const statementRows: string[][] = [
  ["Reference", "Description", "Debit", "Credit"],
  ["SI30-2279", "Tax invoice", "207.90", ""],
  ["SI20-53107", "Tax invoice", "3624.24", ""],
  ["SI20-55792", "Tax invoice", "17325.00", ""],
  ["SI30-2263", "Tax invoice", "1743.63", ""],
  ["SI20-59062", "Tax invoice", "5240.03", ""],
  ["QRV20-12800", "Receipt (later reversed)", "", "18660.00"],
  ["MJV-5761", "Reversal of receipt QRV20-12800", "18660.00", ""],
  ["QRV20-12909", "Receipt", "", "10500.00"],
  ["QRV20-12284", "Receipt (chq)", "", "3918.00"],
  ["SI20-62726", "Tax invoice", "4258.80", ""],
];

// Customer in a DIFFERENT format: single signed-amount column, different headers.
const customerRows: string[][] = [
  ["Doc No", "Narration", "Amount"],
  ["SI30-2279", "Tax invoice", "-207.90"],
  ["SI20-53107", "Tax invoice", "-3624.24"],
  ["SI20-55792", "Tax invoice", "-17325.00"],
  ["SI30-2263", "Tax invoice", "-1477.56"],
  ["SI20-59062", "Tax invoice", "-3626.60"],
  ["QRV20-12284", "Receipt (chq)", "3918.56"],
  ["CASH-WH-0065", "Cash acct - warehouse", "40271.13"],
  ["SI20-61601", "Purchase inv", "-14582.40"],
  ["SI20-62728", "Tax invoice", "-4258.80"],
];

let failures = 0;
const assert = (name: string, cond: boolean, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

async function main() {
  const [company] = await db.select().from(tenants).where(eq(tenants.slug, "aws-distribution")).limit(1);
  if (!company) throw new Error("Seed company 'aws-distribution' not found — run npm run db:seed.");

  const [run] = await db
    .insert(reconciliationRuns)
    .values({ tenantId: company.id, name: "Integration Test (auto)", status: "running" })
    .returning({ id: reconciliationRuns.id });

  try {
    const summary = await executeRun({ runId: run.id, tenantId: company.id, statementRows, customerRows });
    console.log("  summary:", JSON.stringify(summary));

    const [{ n: lines }] = await db.select({ n: count() }).from(ledgerLines).where(eq(ledgerLines.runId, run.id));
    const [{ n: m }] = await db.select({ n: count() }).from(matches).where(eq(matches.runId, run.id));
    const [{ n: ex }] = await db.select({ n: count() }).from(exceptions).where(eq(exceptions.runId, run.id));

    assert("persisted 19 ledger lines", Number(lines) === 19, `got ${lines}`);
    assert("persisted 5 matches (4 exact + 1 fuzzy)", Number(m) === 5, `got ${m}`);
    assert("persisted 5 exceptions", Number(ex) === 5, `got ${ex}`);
    assert("run marked completed with match %", summary.autoMatchPct > 60);
  } finally {
    await db.delete(reconciliationRuns).where(eq(reconciliationRuns.id, run.id)); // cascade cleans children
  }

  console.log(`\n${failures === 0 ? "PERSISTENCE CHECK PASSED ✓" : `${failures} FAILED ✗`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
