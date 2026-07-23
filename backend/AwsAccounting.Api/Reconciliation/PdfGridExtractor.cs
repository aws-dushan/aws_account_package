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
        // Tier 1 — native text layer (digital PDFs)
        List<string[]> native;
        try { native = ExtractNative(buf); }
        catch (Exception e) { log.LogWarning(e, "Native PDF extraction failed"); native = []; }
        if (IsTabular(native)) return new ExtractedGrid(native, "pdf-native");

        // Tier 2 — LLM vision (scanned / non-tabular): the configured vision model reads the PDF natively
        try
        {
            var v = await ai.ExtractPdfTableAsync(buf, ct);
            if (v.Count >= 2) return new ExtractedGrid(v, "pdf-vision");
        }
        catch (AiNotConfiguredException) { /* vision not set up — fall through */ }
        catch (Exception e) { log.LogWarning(e, "PDF vision extraction failed"); }

        // Tier 3 — Tesseract OCR requires the self-hosted OCR service (P6 infra); not invoked here.
        // Fall back to native; any mapping gaps surface a clear run error.
        return new ExtractedGrid(native, native.Count > 0 ? "pdf-native-partial" : "pdf-empty");
    }

    private static bool IsTabular(List<string[]> grid)
        => grid.Count >= 2 && Mapper.Gaps(Mapper.AutoDetect(grid)).Count == 0;

    private sealed class LineBucket
    {
        public double Y;
        public readonly List<(double X, string Str)> Items = [];
    }

    /// <summary>
    /// Native text → table-like grid. Groups words into lines by y-position, clusters x-positions
    /// into columns, and lays each line into those columns. Returns [] for scanned PDFs (no text
    /// layer) so the caller falls through to the vision/OCR tiers.
    /// </summary>
    private static List<string[]> ExtractNative(byte[] buf)
    {
        using var doc = PdfDocument.Open(buf);
        var lines = new List<LineBucket>();

        foreach (var page in doc.GetPages())
        {
            var buckets = new List<LineBucket>();
            foreach (var word in page.GetWords())
            {
                var str = (word.Text ?? "").Trim();
                if (str.Length == 0) continue;
                var x = word.BoundingBox.Left;
                var y = Math.Round(word.BoundingBox.Bottom);   // PdfPig origin is bottom-left; y grows upward

                var bucket = buckets.FirstOrDefault(b => Math.Abs(b.Y - y) <= 2);
                if (bucket is null) { bucket = new LineBucket { Y = y }; buckets.Add(bucket); }
                bucket.Items.Add((x, str));
            }
            // top-to-bottom within the page (PDF y grows upward)
            foreach (var b in buckets.OrderByDescending(b => b.Y))
            {
                b.Items.Sort((a, c) => a.X.CompareTo(c.X));
                lines.Add(b);
            }
        }

        if (lines.Count == 0) return [];

        var centres = ColumnCentres(lines.SelectMany(l => l.Items.Select(i => i.X)).ToList());
        if (centres.Count == 0) return [];

        return lines.Select(l =>
        {
            var cells = new string[centres.Count];
            Array.Fill(cells, "");
            foreach (var it in l.Items)
            {
                int ci = Nearest(centres, it.X);
                cells[ci] = cells[ci].Length == 0 ? it.Str : $"{cells[ci]} {it.Str}";
            }
            return cells;
        }).ToList();
    }

    /// <summary>Cluster x-positions into column centres (gap-based).</summary>
    private static List<double> ColumnCentres(List<double> xs, double gap = 18)
    {
        var sorted = xs.OrderBy(x => x).ToList();
        var centres = new List<double>();
        var cluster = new List<double>();
        foreach (var x in sorted)
        {
            if (cluster.Count > 0 && x - cluster[^1] > gap)
            {
                centres.Add(cluster.Average());
                cluster = [];
            }
            cluster.Add(x);
        }
        if (cluster.Count > 0) centres.Add(cluster.Average());
        return centres;
    }

    private static int Nearest(List<double> centres, double x)
    {
        int best = 0;
        double d = double.PositiveInfinity;
        for (int i = 0; i < centres.Count; i++)
        {
            var dd = Math.Abs(centres[i] - x);
            if (dd < d) { d = dd; best = i; }
        }
        return best;
    }
}
