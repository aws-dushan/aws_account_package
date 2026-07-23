import { parseWorkbook } from "../../lib/xlsx";
import { extractPdfNative } from "../../lib/pdf";
import { aiExtractPdfTable } from "../../lib/ai";
import { autoDetectMapping, mappingGaps } from "./ledger-mapping";

function isTabular(grid: string[][]): boolean {
  return grid.length >= 2 && mappingGaps(autoDetectMapping(grid)).length === 0;
}

/**
 * Extract a grid (rows of cells) from any supported file. The grid then flows through
 * the SAME learned-mapping resolver as spreadsheets — so PDFs learn formats too.
 *
 * Tiers for PDF:  native text layer → LLM vision (scanned) → Tesseract (offline, infra).
 */
export async function extractGrid(buf: Buffer, filename: string): Promise<{ grid: string[][]; source: string }> {
  const isPdf = /\.pdf$/i.test(filename) || buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf) return { grid: parseWorkbook(buf), source: "spreadsheet" };

  // Tier 1 — native text layer (digital PDFs)
  let native: string[][] = [];
  try {
    native = await extractPdfNative(buf);
  } catch {
    native = [];
  }
  if (isTabular(native)) return { grid: native, source: "pdf-native" };

  // Tier 2 — LLM vision (scanned / non-tabular): reuses the configured vision model
  try {
    const v = await aiExtractPdfTable(buf);
    if (v.length >= 2) return { grid: v, source: "pdf-vision" };
  } catch {
    /* vision unavailable/unconfigured — fall through */
  }

  // Tier 3 — Tesseract OCR requires the self-hosted OCR service (Phase 6 infra) and is
  // not invoked here. Fall back to native; any mapping gaps surface a clear run error.
  return { grid: native, source: native.length ? "pdf-native-partial" : "pdf-empty" };
}
