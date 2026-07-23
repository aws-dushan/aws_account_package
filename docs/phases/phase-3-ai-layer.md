# Phase 3 — AI Layer (fallback matching + commentary)

**Goal:** Wire the configurable AI into the pipeline so it touches **only rule-failures**.

**Depends on:** Phase 1 (AI settings) + Phase 2 (rule engine).

## Scope
- [ ] **Stage 5 AI match-rescue:** send only rule-failures + candidate context to the model →
      structured match proposals + confidence (`generateObject` / Zod) → status **"AI-suggested"**
- [ ] Confirm flow: human confirms by default; optional high-confidence auto-apply (admin setting)
- [ ] **Stage 6 AI commentary:** for items still unmatched, generate a plain-English explanation +
      recommended action — rendered in **violet ✦ AI**
- [ ] Stamp every AI output with model + provider (audit)
- [ ] Graceful fallback if the AI provider is unreachable

## Deliverables
- AI match suggestions with confirm UX
- AI explanations on true exceptions only

## Definition of Done
Rule-failures receive AI match suggestions (human-confirmed) and, if still unmatched, AI comments.
Rule-matched items **never** call AI (verified via token/usage logs). All AI output is advisory
and stamped.
