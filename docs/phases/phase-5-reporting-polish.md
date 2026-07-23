# Phase 5 — Reporting & Polish

**Goal:** Production-quality outputs and a refined, accessible UX.

**Depends on:** Phase 2 (data) + Phase 3 (AI content).

## Scope
- [x] **PDF export** — branded report via **pdfkit** (no headless browser): masthead, KPIs,
      colour-coded exception table. Route `/[runId]/export/pdf`. Shared `assembleExportData`.
- [x] Animation pass — **page-transition** (`(app)/template.tsx`, Framer Motion) on every nav.
- [x] **Data-loading animations** — `loading.tsx` skeletons (shimmer) for dashboard, runs list,
      run results, and every admin page; run-progress live stepper (from Phase 2).
- [x] **Dark-theme** — theme toggle in the shell (persisted, no-FOUC inline script); token-driven.
- [x] **Accessibility** — `prefers-reduced-motion` honoured across skeletons/transitions/stepper/
      login; visible focus rings; ARIA on the drawer + toggles.
- [x] Performance — **virtualized** exception list (`@tanstack/react-virtual`); DB indexes on
      hot paths (run_id, tenant_id, audit created_at).

## Deliverables
- Branded PDF export matching the approved artifact
- Polished, accessible, animated UI in both themes

## Definition of Done
PDF export matches the approved design; accessibility pass is green; large runs render smoothly.
