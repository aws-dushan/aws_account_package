# Phase 2 — AR Reconciliation Core (Excel, deterministic)

**Goal:** Full end-to-end reconciliation on Excel — colour-coded UI and Excel export.
This is the first client-showable build.

**Depends on:** Phase 1.

## Scope
- [ ] Upload → **local volume**, **SHA-256 always**, **retention setting**, server-side validation
- [ ] **Multi-format ledger handling** — customers ship different layouts. A mapping layer
      auto-detects the header row + columns (reference/date/description/debit/credit or a single
      signed amount), the user can confirm/override, and profiles are saved per counterparty.
      The **matching engine stays format-agnostic** (operates on canonical lines). *(mapping +
      engine built & self-checked: `npm run engine:check`)*
- [ ] **Worker + BullMQ + Redis**; live progress via **SSE**
- [ ] Reconciliation pipeline:
  - Stage 1 Intake · Stage 2 Parse & cleanse (SheetJS → canonical schema)
  - Stage 3 Internal reversal netting
  - Stage 4 Rule matching (exact → fuzzy/Levenshtein → reversal → amount-diff → 1:M / M:1)
  - Stage 5 Exception classification + **severity mapping** (green/amber/coral/red/grey)
- [ ] Schema: `reconciliation_runs · ledger_lines · matches · match_lines · exceptions · files`
- [ ] UI: upload wizard → **animated live stepper** → **results dashboard** (count-up KPIs, severity bar, pastel chips) → **exception queue + detail drawer**
- [ ] **Excel export** — wire in the exceljs generator, driven by run data

## Deliverables
- Working deterministic reconciliation
- Colour-coded dashboard + exception queue
- Colour-coded Excel export matching the approved design

## Definition of Done
Two Excel files → run → colour-coded dashboard + queue → Excel export matching the approved design.
Result reproducible from the DB and fully audited. **Acceptance case: the NEOMART golden run.**
