import { eq } from "drizzle-orm";
import { db } from "../../db";
import { exceptions, ledgerLines, aiSettings } from "../../db/schema";
import { aiJson } from "../../lib/ai";
import { CATEGORY_LABEL } from "./labels";

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
    .where(eq(exceptions.runId, runId));
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
