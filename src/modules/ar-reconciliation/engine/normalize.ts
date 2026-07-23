import type { RawLine, CanonLine, Side } from "./types";

/**
 * Reference normalisation: upper-case, strip separators/whitespace, and correct the
 * most common OCR/keying substitutions so "SI20-59062", "si20 59062" and "SI2O59O62"
 * collapse to the same key.
 */
export function normalizeReference(ref: string): string {
  return (ref || "")
    .toUpperCase()
    .replace(/[\s\-_/\\.,#:]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^A-Z0-9]/g, "");
}

const SKIP_RE = /\b(carried\s*forward|c\/f|b\/f|brought\s*forward|opening\s*balance|closing\s*balance|sub\s*total|subtotal|total|balance\s*c\/d|balance\s*b\/d)\b/i;

/** True for subtotal / carry-forward / balance rows that must be dropped before matching. */
export function isNoiseRow(description: string, reference: string): boolean {
  const text = `${reference} ${description}`.trim();
  if (!text) return true;
  return SKIP_RE.test(description || "");
}

/** Cleanse + canonicalise raw lines into engine-ready form; drops blank/noise rows. */
export function canonicalize(raw: RawLine[]): CanonLine[] {
  const out: CanonLine[] = [];
  let n = 0;
  for (const r of raw) {
    const reference = (r.reference ?? "").toString().trim();
    const description = (r.description ?? "").toString().trim();
    const debit = round2(Number(r.debit) || 0);
    const credit = round2(Number(r.credit) || 0);
    if (debit === 0 && credit === 0 && !reference) continue;
    if (isNoiseRow(description, reference)) continue;
    const signed = round2(debit - credit);
    out.push({
      key: `${r.side}#${n++}`,
      side: r.side as Side,
      reference,
      normRef: normalizeReference(reference),
      date: r.date ?? null,
      description,
      debit,
      credit,
      signed,
      magnitude: Math.abs(signed),
      sourceRow: r.sourceRow,
    });
  }
  return out;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
