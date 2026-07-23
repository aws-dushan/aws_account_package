import { readFile } from "node:fs/promises";
import { extractPdfNative } from "../src/lib/pdf";

(async () => {
  const buf = await readFile("C:/Users/Saboor.a/Desktop/AWS Accounting/AWS_Distribution Reconciliation Solution - Technical Proposal.pdf");
  const grid = await extractPdfNative(buf);
  const firstMulti = grid.find((r) => r.filter(Boolean).length >= 2) || [];
  console.log("rows:", grid.length);
  console.log("cols (first multi-cell row):", firstMulti.length);
  console.log("sample:", JSON.stringify(firstMulti.slice(0, 6)));
  console.log(grid.length > 0 ? "NATIVE PDF EXTRACTION OK ✓" : "no text (scanned)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
