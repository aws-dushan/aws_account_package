export type Side = "statement" | "customer";

/** A raw ledger line as read from a workbook (already split into debit/credit). */
export type RawLine = {
  side: Side;
  reference: string;
  date?: string | null;
  description?: string;
  debit?: number;
  credit?: number;
  sourceRow?: number;
};

/** A cleansed, normalised line the engine operates on. */
export type CanonLine = {
  key: string;
  side: Side;
  reference: string;
  normRef: string;
  date: string | null;
  description: string;
  debit: number;
  credit: number;
  signed: number; // debit - credit
  magnitude: number; // abs(signed)
  sourceRow?: number;
};

export type RuleCode = "R" | "RA" | "RE" | "F" | "1:M" | "M:1";
export type Severity = "g" | "a" | "c" | "r" | "n";
export type CategoryCode = "D" | "E" | "BAR" | "F" | "FR";

export type MatchResult = {
  ruleCode: RuleCode;
  confidence: number;
  statementKeys: string[];
  customerKeys: string[];
  amount: number;
  rounding: boolean; // matched but with a sub-tolerance difference
};

export type ExceptionResult = {
  key: string;
  side: Side;
  categoryCode: CategoryCode;
  severity: Severity;
  amount: number;
  reference: string;
  description: string;
};

export type ReconcileOptions = {
  amountTolerance?: number; // default 1.00 (AED)
  fuzzyThreshold?: number; // default 0.8
  periodEnd?: string | null; // ISO date; lines after this are BAR (posted after cutoff)
};

export type ReconcileResult = {
  lines: CanonLine[]; // all canonical lines (both sides), keyed for persistence
  matches: MatchResult[];
  exceptions: ExceptionResult[];
  nettedKeys: string[];
  summary: {
    statementCount: number;
    customerCount: number;
    matchedLines: number;
    exceptionCount: number;
    autoMatchPct: number; // matched lines / total lines
    matchedValue: number;
  };
};

export const CATEGORY_SEVERITY: Record<CategoryCode, Severity> = {
  D: "r", // statement only
  E: "r", // customer only
  BAR: "a", // posted after cutoff
  F: "c", // amount difference
  FR: "n", // rounding (immaterial)
};
