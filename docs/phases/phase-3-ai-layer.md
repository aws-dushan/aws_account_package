# Phase 3 — AI Layer (fallback matching + commentary)

> **Status: ⏳ .NET port pending.** The behaviour below is complete in the **TypeScript
> reference** (`src/modules/ar-reconciliation/ai-enrich.ts`) and the React UI. On the .NET
> backend it is a pluggable **`IAiEnricher`** hook with a `NullAiEnricher` no-op, called as
> best-effort Stage 5 / Stage 6 in `RunProcessor` (a run never fails if AI is unconfigured).
> P3 = port `rescueMatches` + `generateExceptionInsights` into a live enricher that reads the
> encrypted AI settings. The `[x]` items below track the TS reference, not the .NET port.

**Goal:** Wire the configurable AI into the pipeline so it touches **only rule-failures**.

**Depends on:** Phase 1 (AI settings) + Phase 2 (rule engine).

## Scope
- [x] **Stage 5 AI match-rescue:** rule-failures (D/E) → the model proposes pairs the rules
      missed → confident pairs become an **"ai_suggested"** match linking both lines.
      (`src/modules/ar-reconciliation/ai-enrich.ts` → `rescueMatches`)
- [x] Confirm flow: human confirms/rejects in the exception drawer (`confirmSuggestion`).
      Confidence threshold configurable in code; auto-apply intentionally off (audit safety).
- [x] **Stage 6 AI commentary:** items still unmatched get a plain-English explanation +
      recommended action — rendered in the **violet ✦ AI** drawer panel. (`generateExceptionInsights`)
- [x] AI output stamped with the model (`ai_model`); confirm/reject + insight generation audited.
- [x] Graceful fallback: all AI steps are best-effort; runs never fail if AI is unreachable or
      unconfigured (`AiNotConfiguredError`). Provider layer: `src/lib/ai.ts`.
- [x] On-demand **✦ Generate AI insights** button on the results page.

> Not live-tested end-to-end (no AI key configured in the dev session) — code-complete and
> typechecked; verified to skip cleanly without a provider.

## Deliverables
- AI match suggestions with confirm UX
- AI explanations on true exceptions only

## Definition of Done
Rule-failures receive AI match suggestions (human-confirmed) and, if still unmatched, AI comments.
Rule-matched items **never** call AI (verified via token/usage logs). All AI output is advisory
and stamped.
