import ExcelJS from "exceljs";
import { CATEGORY_LABEL } from "./labels";

const IND = "FF2E2C7B", IND2 = "FF3A37A0", WHITE = "FFFFFFFF", INK = "FF1A1A2A", MUT = "FF8A8A9C", ACC = "FFEE7623";
const SEV: Record<string, { fill: string; ink: string }> = {
  g: { fill: "FFE3F5E4", ink: "FF1B7A2E" },
  a: { fill: "FFFFF3D6", ink: "FF8A5A00" },
  c: { fill: "FFFCE6DC", ink: "FFA8481A" },
  r: { fill: "FFFBE0E0", ink: "FFA62828" },
  n: { fill: "FFEEEDEA", ink: "FF565550" },
};
const MONEY = "#,##0.00;(#,##0.00)";
const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

export type ExportLine = {
  side: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  amount: number;
  dispositionLabel: string;
  severity: string; // g|a|c|r|n
};
export type ExportData = {
  run: {
    name: string;
    company: string | null;
    autoMatchPct: number | null;
    matchedValue: number | null;
    status: string;
  };
  counts: { lines: number; matches: number; exceptions: number };
  categoryBreakdown: { code: string; count: number }[];
  lines: ExportLine[];
  exceptions: { reference: string; description: string; side: string; category: string; severity: string; amount: number }[];
};

export async function buildRunWorkbook(data: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AWS Accounting Platform";

  // ---------- Summary ----------
  const S = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  S.columns = [{ width: 3 }, { width: 40 }, { width: 22 }];
  const title = (row: number, text: string, sub = false) => {
    S.mergeCells(row, 2, row, 3);
    const c = S.getCell(row, 2);
    c.value = text;
    c.font = { size: sub ? 11 : 15, bold: true, color: { argb: WHITE } };
    c.fill = solid(sub ? IND2 : IND);
    c.alignment = { vertical: "middle", indent: 1 };
    S.getRow(row).height = sub ? 20 : 28;
  };
  title(2, "  AR RECONCILIATION — " + data.run.name.toUpperCase());
  title(3, "  " + (data.run.company ?? ""), true);

  let r = 5;
  const kpi = (label: string, value: string) => {
    const row = S.getRow(r);
    row.getCell(2).value = label;
    row.getCell(2).font = { size: 10.5, color: { argb: MUT } };
    row.getCell(3).value = value;
    row.getCell(3).font = { size: 13, bold: true, color: { argb: INK } };
    row.getCell(3).alignment = { horizontal: "right" };
    row.height = 18;
    r++;
  };
  kpi("Auto-match rate", data.run.autoMatchPct != null ? `${Number(data.run.autoMatchPct).toFixed(1)}%` : "—");
  kpi("Matched value (AED)", data.run.matchedValue != null ? Number(data.run.matchedValue).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—");
  kpi("Ledger lines analysed", String(data.counts.lines));
  kpi("Matches", String(data.counts.matches));
  kpi("Open exceptions", String(data.counts.exceptions));
  r++;

  const eh = S.getRow(r);
  eh.getCell(2).value = "Exceptions by category";
  eh.getCell(2).font = { bold: true, size: 11, color: { argb: IND } };
  eh.getCell(2).border = { bottom: { style: "medium", color: { argb: ACC } } };
  S.mergeCells(r, 2, r, 3);
  r++;
  for (const b of data.categoryBreakdown) {
    const row = S.getRow(r);
    row.getCell(2).value = CATEGORY_LABEL[b.code] ?? b.code;
    row.getCell(3).value = b.count;
    row.getCell(3).alignment = { horizontal: "right" };
    row.height = 16;
    r++;
  }

  // ---------- Detail ----------
  const D = wb.addWorksheet("Detail", { views: [{ showGridLines: false, state: "frozen", ySplit: 1 }] });
  D.columns = [
    { header: "Reference", width: 18 },
    { header: "Description", width: 34 },
    { header: "Side", width: 12 },
    { header: "Debit", width: 14 },
    { header: "Credit", width: 14 },
    { header: "Amount", width: 14 },
    { header: "Status", width: 24 },
  ];
  const dh = D.getRow(1);
  dh.eachCell((c) => {
    c.font = { bold: true, size: 9, color: { argb: WHITE } };
    c.fill = solid(IND2);
    c.alignment = { vertical: "middle" };
  });
  dh.height = 20;
  data.lines.forEach((l) => {
    const row = D.addRow([l.reference, l.description, l.side, l.debit || null, l.credit || null, l.amount, l.dispositionLabel]);
    [4, 5, 6].forEach((i) => { row.getCell(i).numFmt = MONEY; row.getCell(i).alignment = { horizontal: "right" }; });
    row.getCell(1).font = { bold: true, size: 10, color: { argb: IND } };
    const sev = SEV[l.severity] ?? SEV.n;
    const sc = row.getCell(7);
    sc.fill = solid(sev.fill);
    sc.font = { size: 9, bold: true, color: { argb: sev.ink } };
  });
  D.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

  // ---------- Exceptions ----------
  const E = wb.addWorksheet("Exceptions", { views: [{ showGridLines: false, state: "frozen", ySplit: 1 }] });
  E.columns = [
    { header: "Reference", width: 18 },
    { header: "Description", width: 40 },
    { header: "Side", width: 12 },
    { header: "Amount", width: 14 },
    { header: "Category", width: 24 },
  ];
  const eh2 = E.getRow(1);
  eh2.eachCell((c) => { c.font = { bold: true, size: 9, color: { argb: WHITE } }; c.fill = solid(IND2); });
  eh2.height = 20;
  data.exceptions.forEach((x) => {
    const row = E.addRow([x.reference, x.description, x.side, x.amount, CATEGORY_LABEL[x.category] ?? x.category]);
    row.getCell(4).numFmt = MONEY;
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(1).font = { bold: true, size: 10, color: { argb: IND } };
    const sev = SEV[x.severity] ?? SEV.n;
    const cc = row.getCell(5);
    cc.fill = solid(sev.fill);
    cc.font = { size: 9, bold: true, color: { argb: sev.ink } };
  });
  E.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  return (await wb.xlsx.writeBuffer()) as Buffer;
}
