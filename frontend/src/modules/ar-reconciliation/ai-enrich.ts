import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { exceptions, ledgerLines, aiSettings, matches, matchLines, reconciliationRuns } from "../../db/schema";
import { aiJson } from "../../lib/ai";
import { CATEGORY_LABEL } from "./labels";

/**
 * Stage 5 — AI match-rescue. For statement-only (D) and customer-only (E) rule-failures,
 * ask the model to propose pairs the rules missed (references keyed differently, etc.).
 * Confident pairs become an "ai_suggested" match linking both lines; the two exceptions
 * are flagged ai_suggested for human confirmation. Deterministic matches are untouched.
 */
export async function rescueMatches(runId: string, threshold = 0.7): Promise<number> {
  const [run] = await db.select({ tenantId: reconciliationRuns.tenantId }).from(reconciliationRuns).where(eq(reconciliationRuns.id, runId)).limit(1);
  if (!run) return 0;

  const open = await db
    .select({ exId: exceptions.id, lineId: exceptions.ledgerLineId, category: exceptions.categoryCode, ref: ledgerLines.reference, desc: ledgerLines.description, amount: ledgerLines.amount })
    .from(exceptions)
    .leftJoin(ledgerLines, eq(exceptions.ledgerLineId, ledgerLines.id))
    .where(and(eq(exceptions.runId, runId), eq(exceptions.status, "open")));

  const stmt = open.filter((e) => e.category === "D" && e.lineId);
  const cust = open.filter((e) => e.category === "E" && e.lineId);
  if (!stmt.length || !cust.length) return 0;

  const system =
    "You reconcile accounting ledgers. Given statement-only and customer-only items the rules could NOT match, " +
    "propose pairs that are the SAME underlying transaction (reference typed differently, transposed digits, same amount + description). " +
    "Only propose confident pairs. JSON only.";
  const user =
    `Statement-only:\n${JSON.stringify(stmt.map((e, i) => ({ i, reference: e.ref, description: e.desc, amount: Number(e.amount) })))}\n` +
    `Customer-only:\n${JSON.stringify(cust.map((e, j) => ({ j, reference: e.ref, description: e.desc, amount: Number(e.amount) })))}\n\n` +
    `Return {"pairs":[{"i":<statement index>,"j":<customer index>,"confidence":0..1,"reason":"..."}]}`;

  const out = await aiJson<{ pairs: { i: number; j: number; confidence: number; reason: string }[] }>({ purpose: "reasoning", system, user, maxTokens: 1500 });

  const usedS = new Set<number>();
  const usedC = new Set<number>();
  let created = 0;
  for (const p of out.pairs ?? []) {
    if (!p || p.confidence < threshold || usedS.has(p.i) || usedC.has(p.j)) continue;
    const s = stmt[p.i];
    const c = cust[p.j];
    if (!s?.lineId || !c?.lineId) continue;
    usedS.add(p.i);
    usedC.add(p.j);
    await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(matches)
        .values({ runId, tenantId: run.tenantId, ruleCode: "RA", method: "ai", confidence: String(Math.min(0.999, p.confidence)), status: "ai_suggested" })
        .returning({ id: matches.id });
      await tx.insert(matchLines).values([{ matchId: m.id, ledgerLineId: s.lineId! }, { matchId: m.id, ledgerLineId: c.lineId! }]);
      await tx.update(ledgerLines).set({ matchId: m.id }).where(inArray(ledgerLines.id, [s.lineId!, c.lineId!]));
      await tx
        .update(exceptions)
        .set({ status: "ai_suggested", aiExplanation: `Possible match: ${s.ref} ↔ ${c.ref}. ${p.reason}`.slice(0, 600), aiRecommendation: "Confirm if this is the same transaction; otherwise reject." })
        .where(inArray(exceptions.id, [s.exId, c.exId]));
    });
    created++;
  }
  return created;
}

/**
 * Stage 6 — AI commentary. For each rule-failure (exception), ask the configured
 * reasoning model for a plain-English explanation + recommended action. One call per
 * run. Best-effort: throws AiNotConfiguredError if AI isn't set up (caller skips).
 * The AI never alters the deterministic match results — it only interprets them.
 */
export async function generateExceptionInsights(runId: string): Promise<number> {
  const rows = await db
    .select({
      id: exceptions.id,
      category: exceptions.categoryCode,
      amount: exceptions.amount,
      reference: ledgerLines.reference,
      description: ledgerLines.description,
      side: ledgerLines.side,
    })
    .from(exceptions)
    .leftJoin(ledgerLines, eq(exceptions.ledgerLineId, ledgerLines.id))
    .where(and(eq(exceptions.runId, runId), eq(exceptions.status, "open")));
  if (!rows.length) return 0;

  const [cfg] = await db.select({ model: aiSettings.model }).from(aiSettings).where(eq(aiSettings.purpose, "reasoning")).limit(1);

  const items = rows.map((r, i) => ({
    i,
    category: CATEGORY_LABEL[r.category] ?? r.category,
    reference: r.reference ?? "",
    description: r.description ?? "",
    side: r.side ?? "",
    amount: Number(r.amount ?? 0),
  }));

  const system =
    "You are an accounts-receivable reconciliation assistant. For each unreconciled item, " +
    "give a ONE-sentence plain-English explanation of why it most likely did not reconcile, " +
    "and a ONE-sentence recommended next action naming who should do what. Be specific and concise. JSON only.";
  const user =
    `Unreconciled items (AWS Distribution statement vs customer ledger):\n${JSON.stringify(items)}\n\n` +
    `Return exactly: {"insights":[{"i":<index>,"explanation":"...","recommendation":"..."}]}`;

  const out = await aiJson<{ insights: { i: number; explanation: string; recommendation: string }[] }>({
    purpose: "reasoning",
    system,
    user,
    maxTokens: 2000,
  });

  let updated = 0;
  for (const ins of out.insights ?? []) {
    const row = rows[ins.i];
    if (!row) continue;
    await db
      .update(exceptions)
      .set({
        aiExplanation: (ins.explanation ?? "").slice(0, 600) || null,
        aiRecommendation: (ins.recommendation ?? "").slice(0, 600) || null,
        aiModel: cfg?.model ?? null,
      })
      .where(eq(exceptions.id, row.id));
    updated++;
  }
  return updated;
}
