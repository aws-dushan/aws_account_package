/* Self-check for the reconciliation engine + multi-format mapping. Run: npx tsx scripts/engine-check.ts */
import { reconcile } from "../src/modules/ar-reconciliation/engine/engine";
import type { RawLine } from "../src/modules/ar-reconciliation/engine/types";
import { autoDetectMapping, applyMapping, mappingGaps } from "../src/modules/ar-reconciliation/ledger-mapping";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failures++;
}

// ---------- 1) Multi-format mapping ----------
console.log("\n[1] Multi-format ledger mapping");

const formatA = [
  ["AWS Distribution — Statement of Account"],
  ["Reference", "Description", "Debit", "Credit"],
  ["SI30-2279", "Tax invoice", "207.90", ""],
  ["QRV20-12284", "Receipt", "", "3918.00"],
];
const mapA = autoDetectMapping(formatA);
assert("Format A: debit/credit detected", mapA.amountMode === "debit_credit" && mapA.columns.reference === 0);
assert("Format A: no gaps", mappingGaps(mapA).length === 0);
const linesA = applyMapping(formatA, mapA, "statement");
assert("Format A: 2 data rows", linesA.length === 2, `got ${linesA.length}`);

const formatB = [
  ["Customer Ledger Export"],
  ["Doc No", "Narration", "Posting Date", "Amount"],
  ["INV-1001", "Sales invoice", "2025-01-10", "-500.00"],
  ["RCP-2002", "Payment received", "2025-02-01", "1200.00"],
];
const mapB = autoDetectMapping(formatB);
assert("Format B: single signed-amount detected", mapB.amountMode === "signed" && mapB.columns.amount === 3);
assert("Format B: reference + date mapped", mapB.columns.reference === 0 && mapB.columns.date === 2);
const linesB = applyMapping(formatB, mapB, "customer");
assert("Format B: negative → credit", linesB[0].credit === 500 && linesB[0].debit === 0);
assert("Format B: positive → debit", linesB[1].debit === 1200);

// ---------- 2) Engine reconciliation ----------
console.log("\n[2] Engine — representative NEOMART data");

const statement: RawLine[] = [
  { side: "statement", reference: "SI30-2279", description: "Tax invoice", debit: 207.9 },
  { side: "statement", reference: "SI20-53107", description: "Tax invoice", debit: 3624.24 },
  { side: "statement", reference: "SI20-55792", description: "Tax invoice", debit: 17325 },
  { side: "statement", reference: "SI30-2263", description: "Tax invoice", debit: 1743.63 },
  { side: "statement", reference: "SI20-59062", description: "Tax invoice", debit: 5240.03 },
  { side: "statement", reference: "QRV20-12800", description: "Receipt (later reversed)", credit: 18660 },
  { side: "statement", reference: "MJV-5761", description: "Reversal of receipt QRV20-12800", debit: 18660 },
  { side: "statement", reference: "QRV20-12909", description: "Receipt", credit: 10500 },
  { side: "statement", reference: "QRV20-12284", description: "Receipt (chq)", credit: 3918 },
  { side: "statement", reference: "SI20-62726", description: "Tax invoice", debit: 4258.8 },
];
const customer: RawLine[] = [
  { side: "customer", reference: "SI30-2279", description: "Tax invoice", credit: 207.9 },
  { side: "customer", reference: "SI20-53107", description: "Tax invoice", credit: 3624.24 },
  { side: "customer", reference: "SI20-55792", description: "Tax invoice", credit: 17325 },
  { side: "customer", reference: "SI30-2263", description: "Tax invoice", credit: 1477.56 },
  { side: "customer", reference: "SI20-59062", description: "Tax invoice", credit: 3626.6 },
  { side: "customer", reference: "QRV20-12284", description: "Receipt (chq)", debit: 3918.56 },
  { side: "customer", reference: "CASH-WH-0065", description: "Cash acct - warehouse", debit: 40271.13 },
  { side: "customer", reference: "SI20-61601", description: "Purchase inv", credit: 14582.4 },
  { side: "customer", reference: "SI20-62728", description: "Tax invoice", credit: 4258.8 },
];

const r = reconcile(statement, customer, { amountTolerance: 1, fuzzyThreshold: 0.8 });
const byRule = (code: string) => r.matches.filter((m) => m.ruleCode === code).length;
const byCat = (c: string) => r.exceptions.filter((e) => e.categoryCode === c).length;

console.log("  summary:", JSON.stringify(r.summary));
console.log(`  matches: R=${byRule("R")} RA=${byRule("RA")} 1:M=${byRule("1:M")} M:1=${byRule("M:1")} | netted=${r.nettedKeys.length}`);
console.log(`  exceptions: D=${byCat("D")} E=${byCat("E")} F=${byCat("F")} BAR=${byCat("BAR")}`);

assert("exact matches (R) = 4", byRule("R") === 4);
assert("fuzzy match (RA) = 1 (SI20-62726 ~ SI20-62728)", byRule("RA") === 1);
assert("reversal netted 2 lines (QRV20-12800 + MJV-5761)", r.nettedKeys.length === 2);
assert("amount-difference exceptions (F) = 2", byCat("F") === 2);
assert("statement-only (D) = 1 (QRV20-12909)", byCat("D") === 1);
assert("customer-only (E) = 2 (CASH-WH-0065, SI20-61601)", byCat("E") === 2);
assert("rounding flagged on the 3918/3918.56 match", r.matches.some((m) => m.rounding));
assert("total exceptions = 5", r.summary.exceptionCount === 5);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✓" : `${failures} CHECK(S) FAILED ✗`}`);
process.exit(failures === 0 ? 0 : 1);
