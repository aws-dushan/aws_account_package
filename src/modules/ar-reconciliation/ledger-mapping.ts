import type { RawLine, Side } from "./engine/types";

/**
 * Multi-format ledger handling. Customers ship different layouts (column names,
 * order, debit/credit vs a single signed amount, varied date formats). We keep the
 * matching engine format-agnostic and normalise here: detect the header row, map
 * source columns to canonical fields (auto + overridable), then emit RawLines.
 */
export type CanonicalField = "reference" | "date" | "description" | "debit" | "credit" | "amount";

export type ColumnMapping = {
  /** canonical field -> source column index (or -1 if unmapped) */
  columns: Record<CanonicalField, number>;
  /** "debit_credit" = separate Dr/Cr columns; "signed" = one Amount column (+/-) */
  amountMode: "debit_credit" | "signed";
  /** for "signed": positive amount is a debit (true) or a credit (false) */
  positiveIsDebit: boolean;
  headerRow: number;
};

const SYNONYMS: Record<CanonicalField, string[]> = {
  reference: ["reference", "ref", "refno", "ref#", "document", "documentno", "docno", "doc#", "voucher", "voucherno", "invoice", "invoiceno", "invno", "billno", "transactionno", "txnno", "chequeno"],
  date: ["date", "postingdate", "docdate", "documentdate", "transactiondate", "txndate", "valuedate", "entrydate"],
  description: ["description", "narration", "particulars", "details", "memo", "remarks", "notes", "naration"],
  debit: ["debit", "dr", "debitamount", "dramount", "withdrawal", "debitaed"],
  credit: ["credit", "cr", "creditamount", "cramount", "deposit", "creditaed"],
  amount: ["amount", "amt", "value", "net", "netamount", "transactionamount", "balancemovement"],
};

function norm(h: string): string {
  return (h ?? "").toString().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Score how well a header cell matches a field's synonyms (0 = none). */
function fieldScore(header: string, field: CanonicalField): number {
  const h = norm(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of SYNONYMS[field]) {
    if (h === syn) best = Math.max(best, 3);
    else if (h.startsWith(syn) || syn.startsWith(h)) best = Math.max(best, 2);
    else if (h.includes(syn)) best = Math.max(best, 1);
  }
  return best;
}

/** Pick the row (in the first ~20) that looks most like a header row. */
export function detectHeaderRow(rows: string[][]): number {
  let bestRow = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, 20);
  for (let i = 0; i < limit; i++) {
    const score = (rows[i] ?? []).reduce((s, cell) => {
      const fields: CanonicalField[] = ["reference", "date", "description", "debit", "credit", "amount"];
      return s + Math.max(...fields.map((f) => fieldScore(cell, f)), 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  return bestRow;
}

/** Auto-detect a column mapping from a header row. Result is a starting point the UI can adjust. */
export function autoDetectMapping(rows: string[][]): ColumnMapping {
  const headerRow = detectHeaderRow(rows);
  const headers = rows[headerRow] ?? [];
  const fields: CanonicalField[] = ["reference", "date", "description", "debit", "credit", "amount"];
  const columns = Object.fromEntries(fields.map((f) => [f, -1])) as Record<CanonicalField, number>;

  for (const field of fields) {
    let bestCol = -1;
    let bestScore = 0;
    headers.forEach((h, idx) => {
      const score = fieldScore(h, field);
      // don't reuse a column already claimed by a higher-scoring field
      const taken = Object.values(columns).includes(idx);
      if (score > bestScore && !taken) {
        bestScore = score;
        bestCol = idx;
      }
    });
    columns[field] = bestCol;
  }

  const amountMode: ColumnMapping["amountMode"] =
    columns.debit >= 0 || columns.credit >= 0 ? "debit_credit" : "signed";

  return { columns, amountMode, positiveIsDebit: true, headerRow };
}

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-()]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : 0;
}

/** Apply a mapping to the sheet rows (below the header) and emit RawLines for one side. */
export function applyMapping(rows: string[][], mapping: ColumnMapping, side: Side): RawLine[] {
  const { columns, amountMode, positiveIsDebit, headerRow } = mapping;
  const at = (row: string[], col: number) => (col >= 0 ? row[col] : undefined);
  const out: RawLine[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.every((c) => c == null || String(c).trim() === "")) continue;

    let debit = 0;
    let credit = 0;
    if (amountMode === "debit_credit") {
      debit = toNumber(at(row, columns.debit));
      credit = toNumber(at(row, columns.credit));
    } else {
      const amt = toNumber(at(row, columns.amount));
      if (positiveIsDebit) {
        if (amt >= 0) debit = amt;
        else credit = -amt;
      } else {
        if (amt >= 0) credit = amt;
        else debit = -amt;
      }
    }

    out.push({
      side,
      reference: (at(row, columns.reference) ?? "").toString().trim(),
      date: (at(row, columns.date) ?? null) as string | null,
      description: (at(row, columns.description) ?? "").toString().trim(),
      debit,
      credit,
      sourceRow: i + 1,
    });
  }
  return out;
}

/** Fields still unmapped — the UI should prompt the user to resolve these. */
export function mappingGaps(mapping: ColumnMapping): CanonicalField[] {
  const gaps: CanonicalField[] = [];
  if (mapping.columns.reference < 0) gaps.push("reference");
  if (mapping.amountMode === "debit_credit") {
    if (mapping.columns.debit < 0) gaps.push("debit");
    if (mapping.columns.credit < 0) gaps.push("credit");
  } else if (mapping.columns.amount < 0) {
    gaps.push("amount");
  }
  return gaps;
}
