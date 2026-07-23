import * as XLSX from "xlsx";

/** Read a workbook (xlsx/xls/csv) buffer into a matrix of stringified cells. */
export function parseWorkbook(buf: Buffer, sheetName?: string): string[][] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const name = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  return rows.map((r) => (r as unknown[]).map((c) => (c == null ? "" : String(c))));
}

export function listSheets(buf: Buffer): string[] {
  return XLSX.read(buf, { type: "buffer" }).SheetNames;
}
