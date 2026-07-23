import "dotenv/config";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { tenants, reconciliationRuns, files } from "../src/db/schema";
import { saveUpload } from "../src/lib/storage";

function xlsxBuf(aoa: string[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

(async () => {
  const [co] = await db.select().from(tenants).where(eq(tenants.slug, "aws-distribution")).limit(1);
  const sBuf = xlsxBuf([["Reference", "Description", "Debit", "Credit"], ["SI30-2263", "Tax invoice", "1743.63", ""], ["QRV20-12909", "Receipt", "", "10500.00"]]);
  const cBuf = xlsxBuf([["Doc No", "Narration", "Amount"], ["SI30-2263", "Tax invoice", "-1477.56"], ["CASH-WH-0065", "Cash acct", "40271.13"]]);
  const s = await saveUpload(co.id, "statement.xlsx", sBuf);
  const c = await saveUpload(co.id, "customer.xlsx", cBuf);
  const [run] = await db.insert(reconciliationRuns).values({ tenantId: co.id, name: "Mapping Smoke", status: "draft" }).returning({ id: reconciliationRuns.id });
  const [sf] = await db.insert(files).values({ tenantId: co.id, kind: "statement", originalName: "statement.xlsx", sizeBytes: s.size, sha256: s.sha256, storageKey: s.storageKey }).returning({ id: files.id });
  const [cf] = await db.insert(files).values({ tenantId: co.id, kind: "customer", originalName: "customer.xlsx", sizeBytes: c.size, sha256: c.sha256, storageKey: c.storageKey }).returning({ id: files.id });
  await db.update(reconciliationRuns).set({ statementFileId: sf.id, customerFileId: cf.id }).where(eq(reconciliationRuns.id, run.id));
  console.log("RUNID=" + run.id);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
