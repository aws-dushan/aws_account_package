# Phase 4 — Ingestion: PDF + OCR

**Goal:** Accept PDFs and scanned documents through a tiered extraction pipeline.

**Depends on:** Phase 2 (canonical schema) + Phase 1 (AI vision config).

## Scope
- [ ] PDF text-layer extraction (pdf-parse / pdfjs) + confidence check
- [ ] **LLM-vision tier:** render pages to images → configurable vision model extracts the table
- [ ] **Tesseract** self-hosted container as the offline last resort
- [ ] File-type sniffing, structure validation, clear error surfacing

## Tiering
```
native parse → (low confidence) → LLM vision → (fail/disabled) → Tesseract
```

## Deliverables
- PDF and scanned-document intake producing the same canonical schema as Excel

## Definition of Done
A digital PDF parses natively; a scanned PDF flows native → vision → Tesseract; the output
schema is identical to the Excel path and feeds the same reconciliation pipeline.
