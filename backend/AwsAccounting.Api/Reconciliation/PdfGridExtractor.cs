using System.Text.RegularExpressions;
using AwsAccounting.Api.Services;
using UglyToad.PdfPig;

namespace AwsAccounting.Api.Reconciliation;

/// <summary>
/// Tiered PDF extraction (P4): native text layer → LLM vision → (Tesseract, infra/P6).
/// The extracted grid flows through the SAME <see cref="MappingResolver"/> as spreadsheets,
/// so PDFs learn formats exactly like Excel. Ported from the TS <c>lib/pdf.ts</c> + <c>ingest.ts</c>.
/// </summary>
public sealed class PdfGridExtractor(AiClient ai, ILogger<PdfGridExtractor> log) : IPdfGridExtractor
{
    public async Task<ExtractedGrid?> ExtractAsync(byte[] buf, string filename, CancellationToken ct)
    {
        // PDFs are read with AI vision FIRST — it handles the widest range of real statement
        // layouts most accurately. Native text extraction is the offline fallback used when no
        // vision model is configured or the AI call fails (e.g. provider quota exhausted).
        try
        {
            var v = await ai.ExtractPdfTableAsync(buf, ct);
            if (v.Count >= 2) return new ExtractedGrid(v, "pdf-vision");
        }
        catch (AiNotConfiguredException) { /* no vision provider — use native fallback */ }
        catch (Exception e) { log.LogWarning(e, "PDF vision extraction failed; falling back to native text"); }

        List<string[]> native;
        try { native = ExtractNative(buf); }
        catch (Exception e) { log.LogWarning(e, "Native PDF extraction failed"); native = []; }
        return new ExtractedGrid(native, native.Count > 0 ? "pdf-native" : "pdf-empty");
    }

    private readonly record struct Word(double X0, double X1, double Y, string Str);

    private static readonly Regex DateRx = new(
        @"(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})", RegexOptions.Compiled);
    // A monetary amount (has decimals) — distinguishes transaction rows from phone/page numbers in the preamble.
    private static readonly Regex AmtRx = new(@"\d[\d,]*\.\d{2}\b", RegexOptions.Compiled);

    /// <summary>
    /// Native text → table-like grid. Robust to real statement layouts: it derives column
    /// boundaries from the DATA rows (so a wide address preamble can't merge columns) and merges a
    /// stacked, multi-row header band into one header row. Returns [] for scanned PDFs (no text
    /// layer) so the caller falls through to the vision/OCR tiers.
    /// </summary>
    public static List<string[]> ExtractNative(byte[] buf)
    {
        using var doc = PdfDocument.Open(buf);

        // 1) All words with absolute (top-down) coordinates; pages stacked vertically.
        var words = new List<Word>();
        double pageTop = 0;
        foreach (var page in doc.GetPages())
        {
            double h = page.Height;
            foreach (var w in page.GetWords())
            {
                var str = (w.Text ?? "").Trim();
                if (str.Length == 0) continue;
                var bb = w.BoundingBox;
                words.Add(new Word(bb.Left, bb.Right, pageTop + (h - bb.Top), str)); // Y grows downward
            }
            pageTop += h + 20;
        }
        if (words.Count == 0) return [];

        // 2) Group words into visual lines (by Y), each sorted left→right, ordered top→bottom.
        var lines = BucketLines(words);

        // 3) Column x-positions from the HEADER label rows — these mark the true column centres
        //    even when the amounts below are right-aligned (which whitespace projection can't split).
        //    Only rows with ≥2 label words count, so a lone super-header ("AMOUNT") is ignored.
        var dataLines = lines.Where(LooksLikeData).ToList();
        int fdForAnchors = lines.FindIndex(LooksLikeData);
        var anchorScan = (fdForAnchors > 0 ? lines.Take(fdForAnchors) : lines.Take(Math.Min(lines.Count, 35))).ToList();

        // When Debit AND Credit columns exist, "Amount" is a super-header spanning them — not its own column.
        var labelWords = anchorScan.SelectMany(l => l).Where(w => Mapper.BestFieldScore(w.Str) >= 2).ToList();
        bool hasDrCr = labelWords.Any(w => w.Str.Contains("Debit", StringComparison.OrdinalIgnoreCase))
                    && labelWords.Any(w => w.Str.Contains("Credit", StringComparison.OrdinalIgnoreCase));
        bool IsAnchor(Word w) => Mapper.BestFieldScore(w.Str) >= 2
            && !(hasDrCr && w.Str.Contains("Amount", StringComparison.OrdinalIgnoreCase));

        var centres = anchorScan
            .Select(l => l.Where(IsAnchor).Select(w => (w.X0 + w.X1) / 2).ToList())
            .Where(cs => cs.Count >= 2)
            .SelectMany(cs => cs)
            .OrderBy(x => x)
            .ToList();

        var bands = centres.Count >= 3
            ? AnchorBands(centres)
            : ColumnBands(dataLines.Count >= 3 ? dataLines : lines);
        if (bands.Count == 0) return [];

        // 4) Lay every line into the data-derived columns.
        var grid = lines.Select(l =>
        {
            var cells = new string[bands.Count];
            Array.Fill(cells, "");
            foreach (var w in l)
            {
                int ci = BandIndex(bands, w.X0, w.X1);
                cells[ci] = cells[ci].Length == 0 ? w.Str : $"{cells[ci]} {w.Str}";
            }
            return cells;
        }).ToList();

        // 5) Merge the stacked header band above the first data row into one header row,
        //    and drop the preamble — so DATE/TRANSACTION/NARRATION/Debit/Credit align to columns.
        int firstData = lines.FindIndex(LooksLikeData);
        if (firstData <= 0) return grid;

        // The header band = the rows above the data that carry ≥2 field labels
        // (e.g. "DATE TRANSACTION NARRATION" and "Debit Credit Balance"). Merge them into one row.
        var headerRows = Enumerable.Range(0, Math.Min(firstData, grid.Count))
            .Where(i => grid[i].Count(c => Mapper.BestFieldScore(c) >= 2) >= 2)
            .ToList();
        if (headerRows.Count == 0) return grid;

        var header = new string[bands.Count];
        Array.Fill(header, "");
        foreach (var hi in headerRows)
            for (int c = 0; c < bands.Count && c < grid[hi].Length; c++)
                if (!string.IsNullOrWhiteSpace(grid[hi][c]))
                    header[c] = header[c].Length == 0 ? grid[hi][c] : $"{header[c]} {grid[hi][c]}";

        var result = new List<string[]> { header };
        result.AddRange(grid.Skip(firstData));
        return result;
    }

    private static List<List<Word>> BucketLines(IEnumerable<Word> words)
    {
        var keys = new List<double>();
        var buckets = new List<List<Word>>();
        foreach (var w in words.OrderBy(w => w.Y))
        {
            int found = -1;
            for (int i = 0; i < keys.Count; i++) if (Math.Abs(keys[i] - w.Y) <= 2.4) { found = i; break; }
            if (found < 0) { keys.Add(w.Y); buckets.Add([w]); }
            else buckets[found].Add(w);
        }
        return buckets
            .Select(b => b.OrderBy(w => w.X0).ToList())
            .OrderBy(b => b.Min(w => w.Y))
            .ToList();
    }

    private static bool LooksLikeData(List<Word> line)
    {
        var text = string.Join(" ", line.Select(w => w.Str));
        return DateRx.IsMatch(text) && AmtRx.IsMatch(text);
    }

    /// <summary>Column bands from header-label centres: each column spans the midpoints to its neighbours.</summary>
    private static List<(double Min, double Max)> AnchorBands(List<double> centres)
    {
        var cs = new List<double>();
        foreach (var c in centres)
        {
            if (cs.Count > 0 && c - cs[^1] < 14) cs[^1] = (cs[^1] + c) / 2; // merge near-duplicate anchors
            else cs.Add(c);
        }
        var bands = new List<(double, double)>();
        for (int i = 0; i < cs.Count; i++)
        {
            double lo = i == 0 ? double.NegativeInfinity : (cs[i - 1] + cs[i]) / 2;
            double hi = i == cs.Count - 1 ? double.PositiveInfinity : (cs[i] + cs[i + 1]) / 2;
            bands.Add((lo, hi));
        }
        return bands;
    }

    /// <summary>Column bands via vertical-whitespace projection of the basis rows' word spans.</summary>
    private static List<(double Min, double Max)> ColumnBands(List<List<Word>> basis, double minGap = 7)
    {
        var spans = basis.SelectMany(l => l.Select(w => (w.X0, w.X1))).OrderBy(t => t.X0).ToList();
        if (spans.Count == 0) return [];
        var bands = new List<(double, double)>();
        double min = spans[0].X0, max = spans[0].X1;
        foreach (var (x0, x1) in spans.Skip(1))
        {
            if (x0 > max + minGap) { bands.Add((min, max)); min = x0; max = x1; }
            else max = Math.Max(max, x1);
        }
        bands.Add((min, max));
        return bands;
    }

    private static int BandIndex(List<(double Min, double Max)> bands, double x0, double x1)
    {
        double c = (x0 + x1) / 2;
        for (int i = 0; i < bands.Count; i++)
            if (c >= bands[i].Min - 2 && c <= bands[i].Max + 2) return i;
        int best = 0; double bd = double.MaxValue;
        for (int i = 0; i < bands.Count; i++)
        {
            double d = c < bands[i].Min ? bands[i].Min - c : c - bands[i].Max;
            if (Math.Abs(d) < bd) { bd = Math.Abs(d); best = i; }
        }
        return best;
    }
}
