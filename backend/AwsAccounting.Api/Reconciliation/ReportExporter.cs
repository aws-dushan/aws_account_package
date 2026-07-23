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

/// <summary>One line-by-line reconciliation row (our ledger vs the customer's, joined by match).</summary>
public sealed record ExportMatchedRow(string Reference, string Description, decimal OurDebit, decimal OurCredit, decimal CustDebit, decimal CustCredit, decimal Difference, string Status, string Severity);

public sealed record ExportData(
    ExportRunMeta Run,
    ExportCounts Counts,
    List<CategoryCount> CategoryBreakdown,
    List<ExportLine> Lines,
    List<ExportException> Exceptions,
    List<ExportMatchedRow> Detail);

/// <summary>
/// Assembles a run's results into an <see cref="ExportData"/> and renders colour-coded,
/// pastel Excel (ClosedXML) and PDF (QuestPDF) reports — glanceable both on-screen and downloaded.
/// </summary>
public sealed class ReportExporter(AppDbContext db)
{
    // Brand + palette (ClosedXML wants hex without alpha).
    private const string Ind = "#2E2C7B", Ind2 = "#3A37A0", Ink = "#1A1A2A", Mut = "#8A8A9C", Acc = "#EE7623";
    private const string Hair = "#E7E7EF", Band = "#F7F7FB", Card2 = "#FAF9FD";
    private const string Money = "#,##0.00;(#,##0.00)";

    // Pastel KPI card colours (fill / ink) — matches the on-screen palette.
    private static readonly (string fill, string ink)[] KpiColors =
    {
        ("#EEF1FC", "#2E2C7B"), // indigo
        ("#E3F5E4", "#1B7A2E"), // green
        ("#FCE6DC", "#A8481A"), // coral
        ("#ECE7FB", "#463499"), // violet
        ("#FFF3D6", "#8A5A00"), // amber
    };

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

        // Line-by-line matching (Detail): group matched lines by match; join our side vs the customer's.
        var detail = new List<ExportMatchedRow>();
        foreach (var g in lines.Where(l => l.MatchId != null).GroupBy(l => l.MatchId!.Value))
        {
            var refStr = g.Select(l => l.Reference).FirstOrDefault(r => !string.IsNullOrWhiteSpace(r)) ?? "";
            var desc = g.Select(l => l.Description).FirstOrDefault(d => !string.IsNullOrWhiteSpace(d)) ?? "";
            decimal od = g.Where(l => l.Side == "statement").Sum(l => l.Debit);
            decimal oc = g.Where(l => l.Side == "statement").Sum(l => l.Credit);
            decimal cd = g.Where(l => l.Side == "customer").Sum(l => l.Debit);
            decimal cc = g.Where(l => l.Side == "customer").Sum(l => l.Credit);
            decimal diff = (od + cd) - (oc + cc);
            var status = matches.TryGetValue(g.Key, out var rc) ? $"{Labels.RuleLabel(rc)} match" : "Matched";
            detail.Add(new ExportMatchedRow(refStr, desc, od, oc, cd, cc, diff, status, Math.Abs(diff) < 0.005m ? "g" : "c"));
        }
        // Unmatched lines that raised an exception — shown on their own side.
        foreach (var l in lines.Where(l => l.MatchId == null))
        {
            if (!exByLine.TryGetValue(l.Id, out var ex)) continue;
            bool ours = l.Side == "statement";
            detail.Add(new ExportMatchedRow(
                l.Reference ?? "", l.Description ?? "",
                ours ? l.Debit : 0, ours ? l.Credit : 0,
                ours ? 0 : l.Debit, ours ? 0 : l.Credit,
                ours ? l.Debit - l.Credit : -(l.Debit - l.Credit),
                Labels.CategoryLabel(ex.CategoryCode), ex.Severity));
        }
        detail = detail
            .OrderBy(d => Labels.SeverityOrder.GetValueOrDefault(d.Severity, 9))
            .ThenBy(d => d.Reference, StringComparer.Ordinal)
            .ToList();

        return new ExportData(
            new ExportRunMeta(run.Name, company, run.AutoMatchPct, run.MatchedValue, run.Status),
            new ExportCounts(lines.Count, matches.Count, exRows.Count),
            breakdown,
            exportLines,
            exportExceptions,
            detail);
    }

    // ---------------------------------------------------------------- Excel ----
    public byte[] BuildWorkbook(ExportData data)
    {
        using var wb = new XLWorkbook();
        wb.Style.Font.FontName = "Segoe UI";

        BuildSummarySheet(wb, data);
        BuildMatchedDetailSheet(wb, data);
        BuildLedgerSheet(wb, "Our Ledger", data.Lines.Where(l => l.Side == "statement").ToList());
        BuildLedgerSheet(wb, "Customer Ledger", data.Lines.Where(l => l.Side == "customer").ToList());

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static void BuildSummarySheet(XLWorkbook wb, ExportData data)
    {
        var s = wb.Worksheets.Add("Summary");
        s.ShowGridLines = false;
        s.Column(1).Width = 2.5; s.Column(2).Width = 30; s.Column(3).Width = 30; s.Column(4).Width = 30;

        // Title band (indigo) + orange accent underline.
        var t = s.Range(2, 2, 2, 4).Merge().FirstCell();
        t.Value = "AR RECONCILIATION — " + data.Run.Name.ToUpperInvariant();
        t.Style.Font.SetBold().Font.FontSize = 15; t.Style.Font.FontColor = XLColor.White;
        t.Style.Fill.BackgroundColor = XLColor.FromHtml(Ind);
        t.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center; t.Style.Alignment.Indent = 1;
        s.Row(2).Height = 30;

        var sub = s.Range(3, 2, 3, 4).Merge().FirstCell();
        sub.Value = string.IsNullOrEmpty(data.Run.Company) ? "AWS Accounting Platform" : data.Run.Company;
        sub.Style.Font.FontSize = 10.5; sub.Style.Font.FontColor = XLColor.White;
        sub.Style.Fill.BackgroundColor = XLColor.FromHtml(Ind2);
        sub.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center; sub.Style.Alignment.Indent = 1;
        s.Row(3).Height = 20;
        s.Range(4, 2, 4, 4).Merge().FirstCell().Style.Fill.BackgroundColor = XLColor.FromHtml(Acc);
        s.Row(4).Height = 3;

        // KPI cards (3 across, pastel).
        var kpis = new (string label, string value)[]
        {
            ("Auto-match rate", data.Run.AutoMatchPct != null ? $"{data.Run.AutoMatchPct.Value:0.0}%" : "—"),
            ("Matched value (AED)", data.Run.MatchedValue != null ? data.Run.MatchedValue.Value.ToString("#,##0.00") : "—"),
            ("Open exceptions", data.Counts.Exceptions.ToString()),
            ("Ledger lines", data.Counts.Lines.ToString()),
            ("Matches", data.Counts.Matches.ToString()),
        };
        int row = 6;
        for (int i = 0; i < kpis.Length; i++)
        {
            int col = 2 + (i % 3);
            if (i % 3 == 0 && i > 0) row += 3;
            var (fill, ink) = KpiColors[i % KpiColors.Length];
            var lab = s.Cell(row, col);
            lab.Value = kpis[i].label.ToUpperInvariant();
            lab.Style.Font.SetBold().Font.FontSize = 8; lab.Style.Font.FontColor = XLColor.FromHtml(Mut);
            lab.Style.Fill.BackgroundColor = XLColor.FromHtml(fill);
            lab.Style.Alignment.Indent = 1; s.Row(row).Height = 16;

            var val = s.Cell(row + 1, col);
            val.Value = kpis[i].value;
            val.Style.Font.SetBold().Font.FontSize = 18; val.Style.Font.FontColor = XLColor.FromHtml(ink);
            val.Style.Fill.BackgroundColor = XLColor.FromHtml(fill);
            val.Style.Alignment.Indent = 1; val.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            s.Row(row + 1).Height = 28;
        }
        row += 4;

        // Category breakdown
        var eh = s.Range(row, 2, row, 4).Merge().FirstCell();
        eh.Value = "EXCEPTIONS BY CATEGORY";
        eh.Style.Font.SetBold().Font.FontSize = 10; eh.Style.Font.FontColor = XLColor.FromHtml(Ind);
        eh.Style.Border.BottomBorder = XLBorderStyleValues.Medium; eh.Style.Border.BottomBorderColor = XLColor.FromHtml(Acc);
        row += 2;
        foreach (var b in data.CategoryBreakdown)
        {
            var lc = s.Cell(row, 2); lc.Value = Labels.CategoryLabel(b.Code);
            lc.Style.Font.FontColor = XLColor.FromHtml(Ink);
            var cc = s.Range(row, 3, row, 4).Merge().FirstCell();
            cc.Value = b.Count; cc.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            cc.Style.Font.SetBold(); cc.Style.Font.FontColor = XLColor.FromHtml(Ind);
            s.Row(row).Height = 17;
            row++;
        }
    }

    private static void BuildMatchedDetailSheet(XLWorkbook wb, ExportData data)
    {
        var d = wb.Worksheets.Add("Detail");
        d.ShowGridLines = false;
        WriteHeader(d, ["Reference", "Description", "Our Debit", "Our Credit", "Cust. Debit", "Cust. Credit", "Difference", "Status"],
            [18, 34, 13, 13, 13, 13, 13, 26]);
        int dr = 2;
        foreach (var m in data.Detail)
        {
            var (fill, _) = Labels.SeverityColors(m.Severity);
            for (int c = 1; c <= 8; c++) d.Cell(dr, c).Style.Fill.BackgroundColor = XLColor.FromHtml(fill);
            d.Cell(dr, 1).Value = m.Reference;
            d.Cell(dr, 1).Style.Font.SetBold().Font.FontColor = XLColor.FromHtml(Ind);
            d.Cell(dr, 2).Value = m.Description;
            MoneyCell(d.Cell(dr, 3), m.OurDebit);
            MoneyCell(d.Cell(dr, 4), m.OurCredit);
            MoneyCell(d.Cell(dr, 5), m.CustDebit);
            MoneyCell(d.Cell(dr, 6), m.CustCredit);
            MoneyCell(d.Cell(dr, 7), m.Difference);
            var sc = d.Cell(dr, 8); sc.Value = m.Status; Chip(sc, m.Severity);
            d.Row(dr).Height = 16;
            dr++;
        }
        TotalsRow(d, dr, "Difference total", 6, data.Detail.Sum(m => m.Difference), 7, 8);
        d.SheetView.FreezeRows(1);
        d.Range(1, 1, Math.Max(1, dr - 1), 8).SetAutoFilter();
    }

    private static void BuildLedgerSheet(XLWorkbook wb, string name, List<ExportLine> lines)
    {
        var s = wb.Worksheets.Add(name);
        s.ShowGridLines = false;
        WriteHeader(s, ["Reference", "Description", "Debit", "Credit", "Status"], [18, 40, 15, 15, 26]);
        int r = 2;
        foreach (var l in lines)
        {
            if (r % 2 == 0) BandRow(s, r, 5);
            s.Cell(r, 1).Value = l.Reference;
            s.Cell(r, 1).Style.Font.SetBold().Font.FontColor = XLColor.FromHtml(Ind);
            s.Cell(r, 2).Value = l.Description;
            MoneyCell(s.Cell(r, 3), l.Debit);
            MoneyCell(s.Cell(r, 4), l.Credit);
            var sc = s.Cell(r, 5); sc.Value = l.DispositionLabel; Chip(sc, l.Severity);
            s.Row(r).Height = 16;
            r++;
        }
        var lc = s.Cell(r, 2); lc.Value = "Total"; lc.Style.Font.SetBold(); lc.Style.Font.FontColor = XLColor.FromHtml(Ind);
        lc.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        MoneyCell(s.Cell(r, 3), lines.Sum(l => l.Debit)); s.Cell(r, 3).Style.Font.SetBold();
        MoneyCell(s.Cell(r, 4), lines.Sum(l => l.Credit)); s.Cell(r, 4).Style.Font.SetBold();
        for (int c = 1; c <= 5; c++) s.Cell(r, c).Style.Border.TopBorder = XLBorderStyleValues.Medium;
        s.SheetView.FreezeRows(1);
        s.Range(1, 1, Math.Max(1, r - 1), 5).SetAutoFilter();
    }

    private static void WriteHeader(IXLWorksheet ws, string[] headers, double[] widths)
    {
        for (int i = 0; i < headers.Length; i++)
        {
            var c = ws.Cell(1, i + 1);
            c.Value = headers[i].ToUpperInvariant();
            c.Style.Font.SetBold().Font.FontSize = 9; c.Style.Font.FontColor = XLColor.White;
            c.Style.Fill.BackgroundColor = XLColor.FromHtml(Ind);
            c.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            ws.Column(i + 1).Width = widths[i];
        }
        ws.Row(1).Height = 22;
    }

    private static void BandRow(IXLWorksheet ws, int row, int cols)
    {
        for (int c = 1; c <= cols; c++) ws.Cell(row, c).Style.Fill.BackgroundColor = XLColor.FromHtml(Band);
    }

    private static void TotalsRow(IXLWorksheet ws, int row, string label, int labelCol, decimal total, int totalCol, int cols)
    {
        var lc = ws.Cell(row, labelCol); lc.Value = label;
        lc.Style.Font.SetBold(); lc.Style.Font.FontColor = XLColor.FromHtml(Ind);
        lc.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        var tc = ws.Cell(row, totalCol); tc.Value = total;
        tc.Style.NumberFormat.Format = Money; tc.Style.Font.SetBold(); tc.Style.Font.FontColor = XLColor.FromHtml(Ind);
        tc.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        for (int c = 1; c <= cols; c++)
            ws.Cell(row, c).Style.Border.TopBorder = XLBorderStyleValues.Medium;
        ws.Row(row).Height = 18;
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

                page.Content().PaddingVertical(12).Column(col =>
                {
                    col.Spacing(14);

                    // KPI cards (pastel)
                    col.Item().Row(row =>
                    {
                        row.Spacing(8);
                        Kpi(row, 0, "Auto-match", data.Run.AutoMatchPct != null ? $"{data.Run.AutoMatchPct.Value:0.0}%" : "—");
                        Kpi(row, 1, "Matched AED", data.Run.MatchedValue != null ? data.Run.MatchedValue.Value.ToString("#,##0.00") : "—");
                        Kpi(row, 2, "Exceptions", data.Counts.Exceptions.ToString());
                        Kpi(row, 3, "Lines", data.Counts.Lines.ToString());
                        Kpi(row, 4, "Matches", data.Counts.Matches.ToString());
                    });

                    if (data.CategoryBreakdown.Count > 0)
                    {
                        col.Item().Text("EXCEPTIONS BY CATEGORY").Bold().FontColor(Ind).FontSize(10).LetterSpacing(0.03f);
                        col.Item().Row(row =>
                        {
                            row.Spacing(6);
                            foreach (var b in data.CategoryBreakdown)
                            {
                                row.AutoItem().Background(Card2).Border(1).BorderColor(Hair).PaddingVertical(4).PaddingHorizontal(9)
                                    .Text($"{Labels.CategoryLabel(b.Code)}  ·  {b.Count}").FontColor(Ink).FontSize(8.5f);
                            }
                        });
                    }

                    // Line-by-line detail — our ledger vs the customer's, joined by match
                    col.Item().PaddingTop(2).Text("LINE-BY-LINE DETAIL").Bold().FontColor(Ind).FontSize(10).LetterSpacing(0.03f);
                    col.Item().Table(t =>
                    {
                        t.ColumnsDefinition(c => { c.ConstantColumn(64); c.RelativeColumn(2.2f); c.ConstantColumn(52); c.ConstantColumn(52); c.ConstantColumn(52); c.ConstantColumn(52); c.ConstantColumn(54); c.ConstantColumn(68); });
                        foreach (var h in new[] { "REF", "DESCRIPTION", "OUR DR", "OUR CR", "CUST DR", "CUST CR", "DIFF", "STATUS" })
                            t.Cell().Background(Ind).Padding(4).Text(h).FontColor(Colors.White).Bold().FontSize(7f);
                        foreach (var m in data.Detail)
                        {
                            var (fill, ink) = Labels.SeverityColors(m.Severity);
                            t.Cell().Background(fill).Padding(3).Text(m.Reference).Bold().FontColor(Ind).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).Text(m.Description).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).AlignRight().Text(Money0(m.OurDebit)).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).AlignRight().Text(Money0(m.OurCredit)).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).AlignRight().Text(Money0(m.CustDebit)).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).AlignRight().Text(Money0(m.CustCredit)).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).AlignRight().Text(Money0(m.Difference)).FontSize(7.5f);
                            t.Cell().Background(fill).Padding(3).Text(m.Status).FontColor(ink).Bold().FontSize(7f);
                        }
                    });

                    // Our ledger (statement) — its own page
                    col.Item().PageBreak();
                    LedgerTable(col, "OUR LEDGER (STATEMENT)", data.Lines.Where(l => l.Side == "statement"));

                    // Customer ledger — its own page
                    col.Item().PageBreak();
                    LedgerTable(col, "CUSTOMER LEDGER", data.Lines.Where(l => l.Side == "customer"));
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

        static void Kpi(RowDescriptor row, int idx, string label, string value)
        {
            var (fill, ink) = KpiColors[idx % KpiColors.Length];
            row.RelativeItem().Background(fill).Padding(9).Column(c =>
            {
                c.Item().Text(label.ToUpperInvariant()).FontColor(Mut).FontSize(7.5f).Bold();
                c.Item().PaddingTop(3).Text(value).Bold().FontColor(ink).FontSize(15);
            });
        }

        static string Money0(decimal v) => v == 0 ? "" : v.ToString("#,##0.00");

        static void LedgerTable(ColumnDescriptor col, string title, IEnumerable<ExportLine> lines)
        {
            col.Item().Text(title).Bold().FontColor(Ind).FontSize(11).LetterSpacing(0.03f);
            col.Item().PaddingTop(4).Table(t =>
            {
                t.ColumnsDefinition(c => { c.ConstantColumn(96); c.RelativeColumn(3); c.ConstantColumn(74); c.ConstantColumn(74); c.ConstantColumn(96); });
                foreach (var h in new[] { "REFERENCE", "DESCRIPTION", "DEBIT", "CREDIT", "STATUS" })
                    t.Cell().Background(Ind).Padding(4).Text(h).FontColor(Colors.White).Bold().FontSize(8);
                int i = 0;
                foreach (var l in lines)
                {
                    var bg = (i++ % 2 == 0) ? Band : "#FFFFFF";
                    t.Cell().Background(bg).Padding(3).Text(l.Reference).Bold().FontColor(Ind).FontSize(8);
                    t.Cell().Background(bg).Padding(3).Text(l.Description).FontSize(8);
                    t.Cell().Background(bg).Padding(3).AlignRight().Text(Money0(l.Debit)).FontSize(8);
                    t.Cell().Background(bg).Padding(3).AlignRight().Text(Money0(l.Credit)).FontSize(8);
                    t.Cell().Background(bg).Padding(3).Text(l.DispositionLabel).FontSize(7.5f);
                }
            });
        }
    }
}
