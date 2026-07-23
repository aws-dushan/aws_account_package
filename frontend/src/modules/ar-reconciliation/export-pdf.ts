import PDFDocument from "pdfkit";
import { CATEGORY_LABEL } from "./labels";
import type { ExportData } from "./export";

const IND = "#2e2c7b", ACC = "#ee7623", INK = "#1a1a2a", MUT = "#8a8a9c";
const SEV: Record<string, { fill: string; ink: string }> = {
  g: { fill: "#e3f5e4", ink: "#1b7a2e" },
  a: { fill: "#fff3d6", ink: "#8a5a00" },
  c: { fill: "#fce6dc", ink: "#a8481a" },
  r: { fill: "#fbe0e0", ink: "#a62828" },
  n: { fill: "#eeedea", ink: "#565550" },
};
const aed = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Branded one-file PDF report (no headless browser). */
export async function buildRunPdf(data: ExportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const pageW = doc.page.width;
  const M = 40;
  const W = pageW - M * 2;

  // masthead
  doc.rect(0, 0, pageW, 92).fill(IND);
  doc.fill("#ffffff").fontSize(9).text("AR RECONCILIATION REPORT", M, 24, { characterSpacing: 2 });
  doc.fontSize(20).text(data.run.name, M, 40, { width: W });
  doc.fontSize(10).fill("#cfceeb").text(data.run.company ?? "", M, 68, { width: W });
  doc.rect(0, 92, pageW, 3).fill(ACC);

  let y = 120;
  const kpis: [string, string][] = [
    ["Auto-match rate", data.run.autoMatchPct != null ? `${data.run.autoMatchPct.toFixed(1)}%` : "—"],
    ["Matched value", "AED " + aed(data.run.matchedValue)],
    ["Ledger lines", String(data.counts.lines)],
    ["Open exceptions", String(data.counts.exceptions)],
  ];
  const kw = W / 4;
  kpis.forEach((k, i) => {
    const x = M + i * kw;
    doc.fontSize(8).fill(MUT).text(k[0].toUpperCase(), x, y, { width: kw - 8, characterSpacing: 0.5 });
    doc.fontSize(15).fill(INK).text(k[1], x, y + 12, { width: kw - 8 });
  });
  y += 54;
  doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#e7e7ef").stroke();
  y += 16;

  doc.fontSize(12).fill(IND).text(`Exceptions (${data.exceptions.length})`, M, y);
  y += 20;

  const cRef = 90, cDesc = 210, cAmt = 80, cCat = W - cRef - cDesc - cAmt;
  doc.fontSize(8).fill(MUT);
  doc.text("REFERENCE", M, y, { width: cRef });
  doc.text("DESCRIPTION", M + cRef, y, { width: cDesc });
  doc.text("AMOUNT", M + cRef + cDesc, y, { width: cAmt, align: "right" });
  doc.text("CATEGORY", M + cRef + cDesc + cAmt, y, { width: cCat });
  y += 13;
  doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#e7e7ef").stroke();
  y += 6;

  for (const ex of data.exceptions) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    const sev = SEV[ex.severity] ?? SEV.n;
    doc.fontSize(9).fill(INK).text(ex.reference || "—", M, y, { width: cRef });
    doc.fill("#54546a").text(ex.description || "—", M + cRef, y, { width: cDesc, height: 12, ellipsis: true });
    doc.fill(INK).text(aed(ex.amount), M + cRef + cDesc, y, { width: cAmt, align: "right" });
    const label = CATEGORY_LABEL[ex.category] ?? ex.category;
    const chipW = Math.min(cCat - 4, doc.widthOfString(label) + 12);
    doc.roundedRect(M + cRef + cDesc + cAmt, y - 2, chipW, 15, 4).fill(sev.fill);
    doc.fill(sev.ink).fontSize(8).text(label, M + cRef + cDesc + cAmt + 6, y + 1, { width: chipW - 8, ellipsis: true });
    y += 18;
  }

  if (data.exceptions.length === 0) {
    doc.fontSize(10).fill(MUT).text("No exceptions — everything reconciled.", M, y);
  }

  doc.fontSize(8).fill(MUT).text(`AWS Accounting Platform · status: ${data.run.status}`, M, doc.page.height - 38, { width: W, align: "center" });

  doc.end();
  return done;
}
