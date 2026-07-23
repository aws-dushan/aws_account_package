# Phase 4 — Ingestion: PDF + OCR

**Goal:** Accept PDFs and scanned documents through a tiered extraction pipeline.

**Depends on:** Phase 2 (canonical schema) + Phase 1 (AI vision config).

## Scope
- [x] PDF text-layer extraction (**pdfjs-dist**) with position-based row/column reconstruction
      + a tabular confidence check (`isTabular` = mapping has no gaps). `src/lib/pdf.ts`
- [x] **LLM-vision tier:** the configured **vision** model reads the PDF **natively**
      (Anthropic/Google accept PDFs directly — no image rendering) and returns the table grid.
      `aiExtractPdfTable` in `src/lib/ai.ts`
- [~] **Tesseract** — the offline last resort requires the self-hosted OCR service (Phase 6
      infra); the tier is present in `extractGrid` but not invoked in-process yet.
- [x] File-type sniffing (extension + `%PDF-` magic), tiered `extractGrid`, clear error surfacing.
- [x] **Learning applies to PDFs too** — the extracted grid flows through the same
      `resolveMapping` (fingerprint → learned → auto → AI → store), identical to spreadsheets.

> Verified: native PDF extraction works on a real PDF (`npm run pdf:check`). Vision tier is
> code-complete but not live-tested (no vision key configured in dev).

## Tiering
```
native parse → (low confidence) → LLM vision → (fail/disabled) → Tesseract
```

## Deliverables
- PDF and scanned-document intake producing the same canonical schema as Excel

## Definition of Done
A digital PDF parses natively; a scanned PDF flows native → vision → Tesseract; the output
schema is identical to the Excel path and feeds the same reconciliation pipeline.
