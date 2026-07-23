import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, reconciliationRuns } from "../src/db/schema";
import { executeRun } from "../src/modules/ar-reconciliation/run";

const statementRows = [
  ["Reference", "Description", "Debit", "Credit"],
  ["SI30-2263", "Tax invoice", "1743.63", ""],
  ["QRV20-12909", "Receipt", "", "10500.00"],
];
const customerRows = [
  ["Doc No", "Narration", "Amount"],
  ["SI30-2263", "Tax invoice", "-1477.56"],
  ["CASH-WH-0065", "Cash acct", "40271.13"],
];

(async () => {
  const [co] = await db.select().from(tenants).where(eq(tenants.slug, "aws-distribution")).limit(1);
  const [run] = await db.insert(reconciliationRuns).values({ tenantId: co.id, name: "Smoke Run", status: "running" }).returning({ id: reconciliationRuns.id });
  await executeRun({ runId: run.id, tenantId: co.id, statementRows, customerRows });
  console.log("RUNID=" + run.id);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
