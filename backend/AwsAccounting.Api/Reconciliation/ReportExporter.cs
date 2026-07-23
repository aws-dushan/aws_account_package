using AwsAccounting.Api.Data;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AwsAccounting.Api.Reconciliation;

public sealed record ExportLine(string Side, string Reference, string Description, decimal Debit, decimal Credit, decimal Amount, string DispositionLabel, string Severity);
public sealed record ExportException(string Reference, string Description, string Side, string Category, string Severity, decimal Amount);
public sealed record ExportRunMeta(string Name, string? Company, decimal? AutoMatchPct, decimal? MatchedValue, string Status);
public sealed record ExportCounts(int Lines, int Matches, int Exceptions);
public sealed record CategoryCount(string Code, int Count);

public sealed record ExportData(
    ExportRunMeta Run,
    ExportCounts Counts,
    List<CategoryCount> CategoryBreakdown,
    List<ExportLine> Lines,
    List<ExportException> Exceptions);

/// <summary>
/// Assembles a run's results into an <see cref="ExportData"/> and renders colour-coded,
/// pastel Excel (ClosedXML) and PDF (QuestPDF) reports — glanceable both on-screen and downloaded.
/// </summary>
public sealed class ReportExporter(AppDbContext db)
{
    // Brand + palette (ClosedXML wants hex without alpha).
    private const string Ind = "#2E2C7B", Ind2 = "#3A37A0", Ink = "#1A1A2A", Mut = "#8A8A9C", Acc = "#EE7623";
    private const string Money = "#,##0.00;(#,##0.00)";

    public async Task<ExportData> BuildDataAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await db.Runs.AsNoTracking().FirstOrDefaultAsync(r => r.Id == runId, ct)
                  ?? throw new InvalidOperationException("Run not found.");
        var company = await db.Tenants.AsNoTracking().Where(t => t.Id == run.TenantId).Select(t => t.Name).FirstOrDefaultAsync(ct);

        var lines = await db.LedgerLines.AsNoTracking().Where(l => l.RunId == runId).ToListAsync(ct);
        var matches = await db.Matches.AsNoTracking().Where(m => m.RunId == runId).ToDictionaryAsync(m => m.Id, m => m.RuleCode, ct);
        var exRows = await db.Exceptions.AsNoTracking().Where(e => e.RunId == runId).ToListAsync(ct);
        var exByLine = exRows.Where(e => e.LedgerLineId != null).ToDictionary(e => e.LedgerLineId!.Value, e => e);

        var exportLines = new List<ExportLine>();
        foreach (var l in lines)
        {
            string label, sev;
            if (l.MatchId != null && matches.TryGetValue(l.MatchId.Value, out var rule))
            {
                label = $"{Labels.RuleLabel(rule)} match";
                sev = "g";
            }
            else if (exByLine.TryGetValue(l.Id, out var ex))
            {
                label = Labels.CategoryLabel(ex.CategoryCode);
                sev = ex.Severity;
            }
            else
            {
                label = "Netted";
                sev = "n";
            }
            exportLines.Add(new ExportLine(l.Side, l.Reference ?? "", l.Description ?? "", l.Debit, l.Credit, l.Amount, label, sev));
        }

        var byLineId = lines.ToDictionary(l => l.Id);
        var exportExceptions = exRows
            .Select(e =>
            {
                byLineId.TryGetValue(e.LedgerLineId ?? Guid.Empty, out var line);
                return new ExportException(line?.Reference ?? "", line?.Description ?? "", line?.Side ?? "", e.CategoryCode, e.Severity, e.Amount ?? 0m);
            })
            .OrderBy(e => Labels.SeverityOrder.GetValueOrDefault(e.Severity, 9))
            .ToList();

        var breakdown = exRows
            .GroupBy(e => e.CategoryCode)
            .Select(g => new CategoryCount(g.Key, g.Count()))
            .OrderByDescending(g => g.Count)
            .ToList();

        return new ExportData(
            new ExportRunMeta(run.Name, company, run.AutoMatchPct, run.MatchedValue, run.Status),
            new ExportCounts(lines.Count, matches.Count, exRows.Count),
            breakdown,
            exportLines,
            exportExceptions);
    }

    // ---------------------------------------------------------------- Excel ----
    public byte[] BuildWorkbook(ExportData data)
    {
        using var wb = new XLWorkbook();

        // Summary
        var s = wb.Worksheets.Add("Summary");
        s.ShowGridLines = false;
        s.Column(1).Width = 3; s.Column(2).Width = 40; s.Column(3).Width = 22;

        void Title(int row, string text, bool sub = false)
        {
            var c = s.Range(row, 2, row, 3).Merge().FirstCell();
            c.Value = text;
            c.Style.Font.SetBold().Font.FontSize = sub ? 11 : 15;
            c.Style.Font.FontColor = XLColor.White;
            c.Style.Fill.BackgroundColor = XLColor.FromHtml(sub ? Ind2 : Ind);
            c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            c.Style.Alignment.Indent = 1;
            s.Row(row).Height = sub ? 20 : 28;
        }
        Title(2, "  AR RECONCILIATION — " + data.Run.Name.ToUpperInvariant());
        Title(3, "  " + (data.Run.Company ?? ""), true);

        int r = 5;
        void Kpi(string label, string value)
        {
            s.Cell(r, 2).Value = label;
            s.Cell(r, 2).Style.Font.FontSize = 10.5; s.Cell(r, 2).Style.Font.FontColor = XLColor.FromHtml(Mut);
            var v = s.Cell(r, 3);
            v.Value = value;
            v.Style.Font.SetBold().Font.FontSize = 13; v.Style.Font.FontColor = XLColor.FromHtml(Ink);
            v.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            s.Row(r).Height = 18;
            r++;
        }
        Kpi("Auto-match rate", data.Run.AutoMatchPct != null ? $"{data.Run.AutoMatchPct.Value:0.0}%" : "—");
        Kpi("Matched value (AED)", data.Run.MatchedValue != null ? data.Run.MatchedValue.Value.ToString("#,##0.00") : "—");
        Kpi("Ledger lines analysed", data.Counts.Lines.ToString());
        Kpi("Matches", data.Counts.Matches.ToString());
        Kpi("Open exceptions", data.Counts.Exceptions.ToString());
        r++;

        var eh = s.Cell(r, 2);
        eh.Value = "Exceptions by category";
        eh.Style.Font.SetBold().Font.FontSize = 11; eh.Style.Font.FontColor = XLColor.FromHtml(Ind);
        eh.Style.Border.BottomBorder = XLBorderStyleValues.Medium;
        eh.Style.Border.BottomBorderColor = XLColor.FromHtml(Acc);
        s.Range(r, 2, r, 3).Merge();
        r++;
        foreach (var b in data.CategoryBreakdown)
        {
            s.Cell(r, 2).Value = Labels.CategoryLabel(b.Code);
            var cc = s.Cell(r, 3);
            cc.Value = b.Count;
            cc.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            s.Row(r).Height = 16;
            r++;
        }

        // Detail
        var d = wb.Worksheets.Add("Detail");
        d.ShowGridLines = false;
        WriteHeader(d, ["Reference", "Description", "Side", "Debit", "Credit", "Amount", "Status"], [18, 34, 12, 14, 14, 14, 24]);
        int dr = 2;
        foreach (var l in data.Lines)
        {
            d.Cell(dr, 1).Value = l.Reference;
            d.Cell(dr, 1).Style.Font.SetBold().Font.FontColor = XLColor.FromHtml(Ind);
            d.Cell(dr, 2).Value = l.Description;
            d.Cell(dr, 3).Value = l.Side;
            MoneyCell(d.Cell(dr, 4), l.Debit);
            MoneyCell(d.Cell(dr, 5), l.Credit);
            MoneyCell(d.Cell(dr, 6), l.Amount);
            var sc = d.Cell(dr, 7);
            sc.Value = l.DispositionLabel;
            Chip(sc, l.Severity);
            dr++;
        }
        d.SheetView.FreezeRows(1);
        d.Range(1, 1, Math.Max(1, dr - 1), 7).SetAutoFilter();

        // Exceptions
        var e = wb.Worksheets.Add("Exceptions");
        e.ShowGridLines = false;
        WriteHeader(e, ["Reference", "Description", "Side", "Amount", "Category"], [18, 40, 12, 14, 24]);
        int er = 2;
        foreach (var x in data.Exceptions)
        {
            e.Cell(er, 1).Value = x.Reference;
            e.Cell(er, 1).Style.Font.SetBold().Font.FontColor = XLColor.FromHtml(Ind);
            e.Cell(er, 2).Value = x.Description;
            e.Cell(er, 3).Value = x.Side;
            MoneyCell(e.Cell(er, 4), x.Amount);
            var cc = e.Cell(er, 5);
            cc.Value = Labels.CategoryLabel(x.Category);
            Chip(cc, x.Severity);
            er++;
        }
        e.SheetView.FreezeRows(1);
        e.Range(1, 1, Math.Max(1, er - 1), 5).SetAutoFilter();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WriteHeader(IXLWorksheet ws, string[] headers, double[] widths)
    {
        for (int i = 0; i < headers.Length; i++)
        {
            var c = ws.Cell(1, i + 1);
            c.Value = headers[i];
            c.Style.Font.SetBold().Font.FontSize = 9; c.Style.Font.FontColor = XLColor.White;
            c.Style.Fill.BackgroundColor = XLColor.FromHtml(Ind2);
            c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Column(i + 1).Width = widths[i];
        }
        ws.Row(1).Height = 20;
    }

    private static void MoneyCell(IXLCell c, decimal v)
    {
        if (v != 0) c.Value = v;
        c.Style.NumberFormat.Format = Money;
        c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
    }

    private static void Chip(IXLCell c, string severity)
    {
        var (fill, ink) = Labels.SeverityColors(severity);
        c.Style.Fill.BackgroundColor = XLColor.FromHtml(fill);
        c.Style.Font.SetBold().Font.FontSize = 9; c.Style.Font.FontColor = XLColor.FromHtml(ink);
    }

    // ------------------------------------------------------------------ PDF ----
    public byte[] BuildPdf(ExportData data)
    {
        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(28);
                page.DefaultTextStyle(t => t.FontSize(9).FontColor(Ink));

                page.Header().Column(col =>
                {
                    col.Item().Background(Ind).Padding(10).Column(h =>
                    {
                        h.Item().Text("AR RECONCILIATION — " + data.Run.Name.ToUpperInvariant())
                            .FontColor(Colors.White).Bold().FontSize(14);
                        if (!string.IsNullOrEmpty(data.Run.Company))
                            h.Item().Text(data.Run.Company).FontColor("#C9C8EC").FontSize(9);
                    });
                });

                page.Content().PaddingVertical(10).Column(col =>
                {
                    col.Spacing(12);

                    // KPI band
                    col.Item().Row(row =>
                    {
                        row.Spacing(8);
                        Kpi(row, "Auto-match", data.Run.AutoMatchPct != null ? $"{data.Run.AutoMatchPct.Value:0.0}%" : "—");
                        Kpi(row, "Matched (AED)", data.Run.MatchedValue != null ? data.Run.MatchedValue.Value.ToString("#,##0.00") : "—");
                        Kpi(row, "Lines", data.Counts.Lines.ToString());
                        Kpi(row, "Matches", data.Counts.Matches.ToString());
                        Kpi(row, "Exceptions", data.Counts.Exceptions.ToString());
                    });

                    if (data.CategoryBreakdown.Count > 0)
                    {
                        col.Item().Text("Exceptions by category").Bold().FontColor(Ind).FontSize(11);
                        col.Item().Row(row =>
                        {
                            row.Spacing(6);
                            foreach (var b in data.CategoryBreakdown)
                            {
                                row.AutoItem().Background("#EEEDEA").PaddingVertical(4).PaddingHorizontal(8)
                                    .Text($"{Labels.CategoryLabel(b.Code)}: {b.Count}").FontColor(Ink);
                            }
                        });
                    }

                    // Exceptions table (most urgent first)
                    col.Item().Text("Exceptions").Bold().FontColor(Ind).FontSize(11);
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c => { c.ConstantColumn(90); c.RelativeColumn(3); c.ConstantColumn(60); c.ConstantColumn(70); c.ConstantColumn(90); });
                        foreach (var head in new[] { "Reference", "Description", "Side", "Amount", "Category" })
                            table.Cell().Background(Ind2).Padding(4).Text(head).FontColor(Colors.White).Bold().FontSize(8);

                        foreach (var x in data.Exceptions)
                        {
                            var (fill, ink) = Labels.SeverityColors(x.Severity);
                            table.Cell().Padding(4).Text(x.Reference).Bold().FontColor(Ind);
                            table.Cell().Padding(4).Text(x.Description);
                            table.Cell().Padding(4).Text(x.Side);
                            table.Cell().Padding(4).AlignRight().Text(x.Amount.ToString("#,##0.00"));
                            table.Cell().Background(fill).Padding(4).Text(Labels.CategoryLabel(x.Category)).FontColor(ink).Bold();
                        }
                    });
                });

                page.Footer().AlignCenter().Text(t =>
                {
                    t.Span("AWS Accounting Platform  •  Page ").FontColor(Mut).FontSize(8);
                    t.CurrentPageNumber().FontColor(Mut).FontSize(8);
                    t.Span(" / ").FontColor(Mut).FontSize(8);
                    t.TotalPages().FontColor(Mut).FontSize(8);
                });
            });
        });

        return doc.GeneratePdf();

        static void Kpi(RowDescriptor row, string label, string value)
        {
            row.RelativeItem().Background("#F4F4F8").Padding(8).Column(c =>
            {
                c.Item().Text(label).FontColor(Mut).FontSize(8);
                c.Item().Text(value).Bold().FontColor(Ink).FontSize(13);
            });
        }
    }
}
