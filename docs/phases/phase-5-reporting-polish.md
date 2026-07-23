# Phase 5 — Reporting & Polish

**Goal:** Production-quality outputs and a refined, accessible UX.

**Depends on:** Phase 2 (data) + Phase 3 (AI content).

## Scope
- [ ] **PDF export** — headless render of the approved report design (branded, pastel, print-safe)
- [ ] Animation pass across the app (Framer Motion), consistent motion language
- [ ] **Page-transition animations** (route changes) — smooth enter/exit across the shell
- [ ] **Data-loading animations** — skeletons/shimmers + optimistic states for tables, dashboards, and long reconciliation runs (respect `prefers-reduced-motion`)
- [ ] Dark-theme QA on every screen
- [ ] **Accessibility:** WCAG AA, keyboard nav, visible focus, `prefers-reduced-motion`
- [ ] Performance: virtualized tables (TanStack), DB indexes on hot paths

## Deliverables
- Branded PDF export matching the approved artifact
- Polished, accessible, animated UI in both themes

## Definition of Done
PDF export matches the approved design; accessibility pass is green; large runs render smoothly.
