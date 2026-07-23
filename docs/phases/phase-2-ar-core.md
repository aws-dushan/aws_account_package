# Phase 2 — AR Reconciliation Core (Excel, deterministic)

> **Status: ✅ done (.NET API).** Ported to `backend/AwsAccounting.Api/`. Verified end-to-end
> (multipart upload → completed run → results/exceptions → Excel + PDF export) and by the
> golden self-check `GET /api/dev/selfcheck` (**15/15**). The mapping/engine live under
> `Reconciliation/`; the worker is an in-process `BackgroundService` (**no Redis/SSE** —
> the UI polls run status/stage). **Note:** no user confirmation of mappings — they are
> auto-resolved and **learned** per tenant.

**Goal:** Full end-to-end reconciliation on Excel/CSV — colour-coded UI and Excel + PDF export.
This is the first client-showable build.

**Depends on:** Phase 1.

## Scope (delivered)
- [x] Upload → per-tenant disk (`FileStorage`), **SHA-256 always**, server-side type validation.
- [x] **Multi-format ledger handling** — `Mapper` auto-detects the header row + columns
      (reference/date/description/debit/credit or a single signed amount). Mappings are
      **auto-resolved and learned** (`MappingResolver`: fingerprint → learned → auto → AI hook →
      partial), stored per tenant — **no user confirmation**. The **matching engine stays
      format-agnostic** (canonical lines). Excel/CSV now; PDF flows the same path in P4.
- [x] **Background worker** (`RunWorker` = `BackgroundService` + `RunQueue`) — **no Redis**.
      Runs emit stages (Reading files → Resolving columns → Matching → Saving → AI matching →
      AI insights → Completed); the UI polls `GET /api/runs/{id}` for status/stage.
- [x] Reconciliation pipeline (`Reconciler` + `Normalize`/`Similarity`):
  - Intake · parse & cleanse (ClosedXML / CSV → canonical lines)
  - Internal reversal netting
  - Rule matching (exact → fuzzy/Levenshtein → 1:M / M:1 → amount-diff)
  - Exception classification (D/E/BAR/F) + **severity mapping** (green/amber/coral/red/grey)
- [x] Schema (EF): `Runs · LedgerLines · Matches · MatchLines · Exceptions · Files · LedgerMappings`
- [x] API: `RunsController` (create/list/detail/results/export/delete) + `ExceptionsController`
      (list/approve/adjust), gated on `ar-reconciliation.*` permissions, tenant-isolated.
- [x] **Excel export** (ClosedXML) + **PDF export** (QuestPDF) — pastel, colour-coded, glanceable.

## Deliverables
- Working deterministic reconciliation ✅
- Colour-coded results + exception approve/adjust workflow ✅
- Colour-coded Excel + PDF export matching the approved design ✅

## Definition of Done
Two files → run → colour-coded results + exception queue → Excel/PDF export matching the approved
design. Result reproducible from the DB and fully audited. **Acceptance case: the NEOMART golden
run** — reproduced by the dev self-check (4 exact · 1 fuzzy · 2 netted · 2 amount-diff · 1
statement-only · 2 customer-only → 63.16% / 5750.00).
