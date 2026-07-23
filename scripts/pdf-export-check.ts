import { buildRunPdf } from "../src/modules/ar-reconciliation/export-pdf";
import type { ExportData } from "../src/modules/ar-reconciliation/export";

const data: ExportData = {
  run: { name: "NEOMART Q1", company: "AWS Distribution", autoMatchPct: 63.2, matchedValue: 29333.94, status: "completed" },
  counts: { lines: 19, matches: 5, exceptions: 5 },
  categoryBreakdown: [{ code: "F", count: 2 }, { code: "E", count: 2 }, { code: "D", count: 1 }],
  lines: [],
  exceptions: [
    { reference: "SI30-2263", description: "Tax invoice value differs", side: "Statement", category: "F", severity: "c", amount: 266.07 },
    { reference: "CASH-WH-0065", description: "Cash acct - warehouse", side: "Customer", category: "E", severity: "r", amount: 40271.13 },
    { reference: "QRV20-12909", description: "Receipt", side: "Statement", category: "D", severity: "r", amount: 10500 },
  ],
};

(async () => {
  const buf = await buildRunPdf(data);
  const magic = buf.subarray(0, 5).toString("latin1");
  console.log("size:", buf.length, "| magic:", magic);
  console.log(magic === "%PDF-" && buf.length > 1000 ? "PDF EXPORT OK ✓" : "PDF EXPORT FAILED ✗");
  process.exit(magic === "%PDF-" ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
