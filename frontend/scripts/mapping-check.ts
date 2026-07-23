/* Verify auto/learned mapping + multiple formats per customer. Run: npx tsx scripts/mapping-check.ts */
import "dotenv/config";
import { and, eq, count } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, ledgerMappings } from "../src/db/schema";
import { resolveMapping, fingerprint } from "../src/modules/ar-reconciliation/mapping-resolver";

const formatA = [["Reference", "Description", "Debit", "Credit"], ["SI30-2263", "inv", "1743.63", ""], ["SI30-2279", "inv", "207.90", ""]];
const formatB = [["Doc No", "Narration", "Amount"], ["SI30-2263", "inv", "-1477.56"], ["CASH-1", "cash", "40271.13"]];

let failures = 0;
const assert = (n: string, c: boolean, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`); if (!c) failures++; };

async function main() {
  const [co] = await db.select().from(tenants).where(eq(tenants.slug, "aws-distribution")).limit(1);
  // clean slate for these two fingerprints
  await db.delete(ledgerMappings).where(and(eq(ledgerMappings.tenantId, co.id), eq(ledgerMappings.fingerprint, fingerprint(formatA))));
  await db.delete(ledgerMappings).where(and(eq(ledgerMappings.tenantId, co.id), eq(ledgerMappings.fingerprint, fingerprint(formatB))));

  const a1 = await resolveMapping(co.id, formatA, "statement");
  assert("format A first pass = auto (no AI, no confirm)", a1.source === "auto", a1.source);
  assert("format A debit/credit detected", a1.mapping.amountMode === "debit_credit");

  const a2 = await resolveMapping(co.id, formatA, "statement");
  assert("format A second pass = learned (reused)", a2.source === "learned", a2.source);

  const b1 = await resolveMapping(co.id, formatB, "customer");
  assert("format B (different layout) = auto", b1.source === "auto", b1.source);
  assert("format B single signed amount detected", b1.mapping.amountMode === "signed");

  const [{ n }] = await db.select({ n: count() }).from(ledgerMappings).where(eq(ledgerMappings.tenantId, co.id));
  assert("same customer now has >= 2 learned mappings (multiple formats)", Number(n) >= 2, `${n}`);

  // cleanup the two we created
  await db.delete(ledgerMappings).where(and(eq(ledgerMappings.tenantId, co.id), eq(ledgerMappings.fingerprint, fingerprint(formatA))));
  await db.delete(ledgerMappings).where(and(eq(ledgerMappings.tenantId, co.id), eq(ledgerMappings.fingerprint, fingerprint(formatB))));

  console.log(`\n${failures === 0 ? "MAPPING CHECK PASSED ✓" : `${failures} FAILED ✗`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
