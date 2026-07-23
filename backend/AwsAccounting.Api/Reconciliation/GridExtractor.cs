using ClosedXML.Excel;

namespace AwsAccounting.Api.Reconciliation;

public record ExtractedGrid(List<string[]> Grid, string Source);

/// <summary>Extracts a grid from a PDF. P4 wires the native→vision→OCR tiers; until then it declines.</summary>
public interface IPdfGridExtractor
{
    Task<ExtractedGrid?> ExtractAsync(byte[] buf, string filename, CancellationToken ct);
}

public sealed class NullPdfGridExtractor : IPdfGridExtractor
{
    public Task<ExtractedGrid?> ExtractAsync(byte[] buf, string filename, CancellationToken ct)
        => throw new NotSupportedException("PDF ingestion is not available yet (arrives in Phase 4). Please upload an Excel (.xlsx) or CSV file.");
}

/// <summary>
/// Extracts a grid (rows of cell strings) from any supported file. The grid flows through
/// the SAME learned-mapping resolver as spreadsheets — so PDFs will learn formats too (P4).
/// </summary>
public sealed class GridExtractor(IPdfGridExtractor pdf)
{
    public async Task<ExtractedGrid> ExtractAsync(byte[] buf, string filename, CancellationToken ct = default)
    {
        if (IsPdf(buf, filename))
        {
            var r = await pdf.ExtractAsync(buf, filename, ct);
            return r ?? new ExtractedGrid([], "pdf-empty");
        }

        if (filename.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            return new ExtractedGrid(ParseCsv(System.Text.Encoding.UTF8.GetString(buf)), "csv");

        return new ExtractedGrid(ParseWorkbook(buf), "spreadsheet");
    }

    private static bool IsPdf(byte[] buf, string filename)
        => filename.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
           || (buf.Length >= 5 && buf[0] == '%' && buf[1] == 'P' && buf[2] == 'D' && buf[3] == 'F' && buf[4] == '-');

    /// <summary>Reads the first worksheet into rows of formatted cell strings.</summary>
    public static List<string[]> ParseWorkbook(byte[] buf)
    {
        using var ms = new MemoryStream(buf);
        using var wb = new XLWorkbook(ms);
        var ws = wb.Worksheets.FirstOrDefault();
        var used = ws?.RangeUsed();
        if (ws == null || used == null) return [];

        int lastCol = used.LastColumn().ColumnNumber();
        int firstRow = used.FirstRow().RowNumber();
        int lastRow = used.LastRow().RowNumber();

        var rows = new List<string[]>();
        for (int r = firstRow; r <= lastRow; r++)
        {
            var row = new string[lastCol];
            for (int c = 1; c <= lastCol; c++)
                row[c - 1] = ws.Cell(r, c).GetFormattedString() ?? "";
            rows.Add(row);
        }
        return rows;
    }

    /// <summary>Minimal RFC-4180-ish CSV parser (quoted fields, doubled quotes, CRLF/LF).</summary>
    public static List<string[]> ParseCsv(string text)
    {
        var rows = new List<string[]>();
        var row = new List<string>();
        var field = new System.Text.StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < text.Length; i++)
        {
            char ch = text[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                    else inQuotes = false;
                }
                else field.Append(ch);
            }
            else
            {
                switch (ch)
                {
                    case '"': inQuotes = true; break;
                    case ',': row.Add(field.ToString()); field.Clear(); break;
                    case '\r': break;
                    case '\n':
                        row.Add(field.ToString()); field.Clear();
                        rows.Add(row.ToArray()); row.Clear();
                        break;
                    default: field.Append(ch); break;
                }
            }
        }
        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row.ToArray());
        }
        return rows;
    }
}
