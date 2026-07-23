import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { ledgerMappings } from "../../db/schema";
import { autoDetectMapping, mappingGaps, detectHeaderRow, type ColumnMapping, type CanonicalField } from "./ledger-mapping";
import { aiJson, AiNotConfiguredError } from "../../lib/ai";

/** A stable fingerprint of a ledger's header layout (order-independent). */
export function fingerprint(rows: string[][]): string {
  const headers = (rows[detectHeaderRow(rows)] ?? [])
    .map((h) => (h ?? "").toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean)
    .sort()
    .join("|");
  return createHash("sha256").update(headers).digest("hex").slice(0, 32);
}

const num = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) ? v : -1);

/**
 * Resolve a column mapping without asking the user:
 *   1. reuse a learned mapping for this exact header layout (per tenant), else
 *   2. auto-detect (store it if complete), else
 *   3. ask the configured AI to identify the mapping (store it), else
 *   4. return the best-effort auto mapping (executeRun surfaces any gaps).
 * A tenant can have many learned mappings — one per distinct format fingerprint.
 */
export async function resolveMapping(
  tenantId: string,
  rows: string[][],
  side: "statement" | "customer",
): Promise<{ mapping: ColumnMapping; source: string }> {
  const fp = fingerprint(rows);

  const [learned] = await db
    .select()
    .from(ledgerMappings)
    .where(and(eq(ledgerMappings.tenantId, tenantId), eq(ledgerMappings.fingerprint, fp)))
    .limit(1);
  if (learned) {
    const m = learned.mapping as ColumnMapping;
    // header row can vary between files of the same format — recompute it, keep the learned columns.
    return { mapping: { ...m, headerRow: detectHeaderRow(rows) }, source: "learned" };
  }

  const auto = autoDetectMapping(rows);
  if (mappingGaps(auto).length === 0) {
    await store(tenantId, fp, side, auto, "auto");
    return { mapping: auto, source: "auto" };
  }

  try {
    const aiMap = await aiIdentifyMapping(rows, auto);
    if (mappingGaps(aiMap).length === 0) {
      await store(tenantId, fp, side, aiMap, "ai");
      return { mapping: aiMap, source: "ai" };
    }
  } catch (e) {
    if (!(e instanceof AiNotConfiguredError)) console.error("AI mapping failed:", e);
  }

  return { mapping: auto, source: "auto-partial" };
}

async function store(tenantId: string, fp: string, side: string, mapping: ColumnMapping, source: string) {
  await db
    .insert(ledgerMappings)
    .values({ tenantId, fingerprint: fp, side, mapping, source })
    .onConflictDoUpdate({
      target: [ledgerMappings.tenantId, ledgerMappings.fingerprint],
      set: { mapping, source, updatedAt: new Date() },
    });
}

async function aiIdentifyMapping(rows: string[][], auto: ColumnMapping): Promise<ColumnMapping> {
  const headerRow = auto.headerRow;
  const headers = rows[headerRow] ?? [];
  const sample = rows.slice(headerRow + 1, headerRow + 6);
  const system = "You map accounting-ledger spreadsheet columns to canonical fields. Respond with JSON only, no prose.";
  const user =
    `Header cells (0-indexed): ${JSON.stringify(headers)}\n` +
    `Sample data rows: ${JSON.stringify(sample)}\n\n` +
    `Return JSON exactly: {"reference":n,"date":n,"description":n,"debit":n,"credit":n,"amount":n,"amountMode":"debit_credit"|"signed","positiveIsDebit":true|false} ` +
    `where n is the 0-based column index or -1 if absent. Use "debit_credit" when there are separate debit and credit columns; use "signed" for a single +/- amount column (then set positiveIsDebit).`;

  const j = await aiJson<Record<string, unknown>>({ purpose: "reasoning", system, user });
  const columns: Record<CanonicalField, number> = {
    reference: num(j.reference),
    date: num(j.date),
    description: num(j.description),
    debit: num(j.debit),
    credit: num(j.credit),
    amount: num(j.amount),
  };
  const amountMode = j.amountMode === "signed" ? "signed" : columns.debit >= 0 || columns.credit >= 0 ? "debit_credit" : "signed";
  return { columns, amountMode, positiveIsDebit: j.positiveIsDebit !== false, headerRow };
}
