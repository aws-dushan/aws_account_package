import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

type Item = { x: number; str: string };
type Line = { y: number; items: Item[] };

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

/** Cluster x-positions into column centres (gap-based). */
function columnCentres(xs: number[], gap = 18): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const centres: number[] = [];
  let cluster: number[] = [];
  for (const x of sorted) {
    if (cluster.length && x - cluster[cluster.length - 1] > gap) {
      centres.push(avg(cluster));
      cluster = [];
    }
    cluster.push(x);
  }
  if (cluster.length) centres.push(avg(cluster));
  return centres;
}

function nearest(centres: number[], x: number): number {
  let best = 0;
  let d = Infinity;
  centres.forEach((c, i) => {
    const dd = Math.abs(c - x);
    if (dd < d) {
      d = dd;
      best = i;
    }
  });
  return best;
}

/**
 * Native PDF text extraction → a table-like grid. Groups text items into lines by
 * their y-position, clusters x-positions into columns, and lays each line out into
 * those columns. Works for PDFs that carry a text layer (exported ledgers). Returns
 * [] for scanned PDFs (no text) so the caller falls through to the vision/OCR tiers.
 */
export async function extractPdfNative(buf: Buffer): Promise<string[][]> {
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;
  const lines: Line[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, Item[]>();
    for (const raw of content.items as Array<{ str?: string; transform?: number[] }>) {
      const str = (raw.str ?? "").trim();
      if (!str || !raw.transform) continue;
      const x = raw.transform[4];
      const y = Math.round(raw.transform[5]);
      let key = y;
      for (const k of byY.keys()) {
        if (Math.abs(k - y) <= 2) {
          key = k;
          break;
        }
      }
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key)!.push({ x, str });
    }
    const pageLines = [...byY.entries()]
      .sort((a, b) => b[0] - a[0]) // top-to-bottom (PDF y grows upward)
      .map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }));
    lines.push(...pageLines);
  }

  await doc.cleanup();
  if (lines.length === 0) return [];

  const centres = columnCentres(lines.flatMap((l) => l.items.map((i) => i.x)));
  if (centres.length === 0) return [];

  return lines.map((l) => {
    const cells = new Array<string>(centres.length).fill("");
    for (const it of l.items) {
      const ci = nearest(centres, it.x);
      cells[ci] = cells[ci] ? `${cells[ci]} ${it.str}` : it.str;
    }
    return cells;
  });
}
