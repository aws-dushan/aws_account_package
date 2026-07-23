using AwsAccounting.Api.Reconciliation;
using Microsoft.AspNetCore.Mvc;
using QuestPDF.Fluent;
using QuestPDF.Helpers;

namespace AwsAccounting.Api.Controllers;

/// <summary>
/// Development-only self-checks that verify the deterministic engine and the mapping
/// layer against a crafted dataset — the C# port must reproduce the TS behaviour.
/// Returns 404 outside the Development environment.
/// </summary>
[ApiController]
[Route("api/dev")]
public class DevController(IWebHostEnvironment env, IPdfGridExtractor pdf) : ControllerBase
{
    [HttpGet("selfcheck")]
    public IActionResult SelfCheck()
    {
        if (!env.IsDevelopment()) return NotFound();

        var checks = new List<object>();
        bool ok = true;
        int passed = 0;
        void Assert(string name, bool pass, object? actual = null, object? expected = null)
        {
            ok &= pass;
            if (pass) passed++;
            checks.Add(new { name, pass, actual, expected });
        }

        // ---- Engine ----------------------------------------------------------
        var statement = new List<RawLine>
        {
            new("statement", "INV-1001", "2026-01-05", "Sales", 1000, 0),
            new("statement", "INV-1002", "2026-01-06", "Sales", 1500, 0),
            new("statement", "INV-1003", "2026-01-07", "Sales", 2000, 0),
            new("statement", "INV-1004", "2026-01-08", "Sales", 500, 0),
            new("statement", "INV-1005", "2026-01-09", "Sales", 750, 0),            // RA (fuzzy vs INV-1085)
            new("statement", "ADJ-01", "2026-01-10", "Reversal of ADJ-02", 0, 300), // netted
            new("statement", "ADJ-02", "2026-01-10", "Adjustment", 300, 0),         // netted
            new("statement", "INV-2001", "2026-01-11", "Sales", 1200, 0),           // F (diff 50)
            new("statement", "INV-2002", "2026-01-12", "Sales", 900, 0),            // F (diff 20)
            new("statement", "INV-3001", "2026-01-13", "Sales", 400, 0),            // D (statement-only)
        };
        var customer = new List<RawLine>
        {
            new("customer", "INV1001", "2026-01-05", "Purchase", 0, 1000),
            new("customer", "INV 1002", "2026-01-06", "Purchase", 0, 1500),
            new("customer", "INV-1003", "2026-01-07", "Purchase", 0, 2000),
            new("customer", "INV1004", "2026-01-08", "Purchase", 0, 500),
            new("customer", "INV-1085", "2026-01-09", "Purchase", 0, 750),          // RA vs INV-1005
            new("customer", "INV-2001", "2026-01-11", "Purchase", 0, 1150),         // F
            new("customer", "INV-2002", "2026-01-12", "Purchase", 0, 880),          // F
            new("customer", "INV-4001", "2026-01-14", "Purchase", 0, 250),          // E (customer-only)
            new("customer", "INV-4002", "2026-01-15", "Purchase", 0, 175),          // E
        };

        var r = Reconciler.Reconcile(statement, customer);

        int exactR = r.Matches.Count(m => m.RuleCode == "R");
        int fuzzyRA = r.Matches.Count(m => m.RuleCode == "RA");
        int f = r.Exceptions.Count(x => x.CategoryCode == "F");
        int d = r.Exceptions.Count(x => x.CategoryCode == "D");
        int e = r.Exceptions.Count(x => x.CategoryCode == "E");

        Assert("exact R matches", exactR == 4, exactR, 4);
        Assert("fuzzy RA matches", fuzzyRA == 1, fuzzyRA, 1);
        Assert("netted keys", r.NettedKeys.Count == 2, r.NettedKeys.Count, 2);
        Assert("amount-diff F exceptions", f == 2, f, 2);
        Assert("statement-only D exceptions", d == 1, d, 1);
        Assert("customer-only E exceptions", e == 2, e, 2);
        Assert("total exceptions", r.Exceptions.Count == 5, r.Exceptions.Count, 5);
        Assert("normalize O->0 and I->1", Normalize.NormalizeReference("INV-1O01") == "1NV1001", Normalize.NormalizeReference("INV-1O01"), "1NV1001");

        // ---- Mapping ---------------------------------------------------------
        var sheetDrCr = new List<string[]>
        {
            new[] { "Doc No", "Posting Date", "Narration", "Debit", "Credit" },
            new[] { "INV-1001", "2026-01-05", "Sales", "1,000.00", "" },
        };
        var mapDrCr = Mapper.AutoDetect(sheetDrCr);
        Assert("drcr amountMode", mapDrCr.AmountMode == "debit_credit", mapDrCr.AmountMode, "debit_credit");
        Assert("drcr reference col", mapDrCr.Col("reference") == 0, mapDrCr.Col("reference"), 0);
        Assert("drcr no gaps", Mapper.Gaps(mapDrCr).Count == 0, Mapper.Gaps(mapDrCr));
        var drcrLines = Mapper.Apply(sheetDrCr, mapDrCr, "statement");
        Assert("drcr apply -> 1 line, debit 1000", drcrLines.Count == 1 && drcrLines[0].Debit == 1000m, new { drcrLines.Count, debit = drcrLines.FirstOrDefault()?.Debit });

        var sheetSigned = new List<string[]>
        {
            new[] { "Reference", "Value Date", "Details", "Amount" },
            new[] { "PAY-9", "2026-02-01", "Payment", "(500.00)" },
        };
        var mapSigned = Mapper.AutoDetect(sheetSigned);
        Assert("signed amountMode", mapSigned.AmountMode == "signed", mapSigned.AmountMode, "signed");
        var signedLines = Mapper.Apply(sheetSigned, mapSigned, "customer");
        // (500.00) -> -500 -> positiveIsDebit true -> credit 500
        Assert("signed apply -> credit 500", signedLines.Count == 1 && signedLines[0].Credit == 500m, new { credit = signedLines.FirstOrDefault()?.Credit });

        Assert("distinct fingerprints", Mapper.Fingerprint(sheetDrCr) != Mapper.Fingerprint(sheetSigned));

        return Ok(new
        {
            ok,
            summary = r.Summary,
            passed,
            total = checks.Count,
            checks,
        });
    }

    /// <summary>
    /// Verifies the native PDF tier: render a ledger table to a (text-layer) PDF, then extract it
    /// back through <see cref="PdfGridExtractor"/> + the mapping layer and assert it is tabular.
    /// </summary>
    [HttpGet("pdf-selfcheck")]
    public async Task<IActionResult> PdfSelfCheck(CancellationToken ct, [FromQuery] bool download = false)
    {
        if (!env.IsDevelopment()) return NotFound();

        string[] headers = ["Reference", "Date", "Description", "Debit", "Credit"];
        string[][] rows =
        [
            ["INV-1001", "2026-01-05", "Sales", "1000.00", ""],
            ["INV-1002", "2026-01-06", "Sales", "1500.00", ""],
            ["INV-2001", "2026-01-11", "Sales", "1200.00", ""],
            ["INV-3001", "2026-01-13", "Sales", "400.00", ""],
        ];

        var bytes = Document.Create(c => c.Page(p =>
        {
            p.Size(PageSizes.A4);
            p.Margin(24);
            p.DefaultTextStyle(t => t.FontSize(10));
            p.Content().Table(table =>
            {
                table.ColumnsDefinition(cd => { cd.RelativeColumn(2); cd.RelativeColumn(2); cd.RelativeColumn(3); cd.RelativeColumn(2); cd.RelativeColumn(2); });
                foreach (var h in headers) table.Cell().PaddingVertical(4).PaddingRight(16).Text(h).Bold();
                foreach (var row in rows)
                    foreach (var cell in row)
                        table.Cell().PaddingVertical(4).PaddingRight(16).Text(cell);
            });
        })).GeneratePdf();

        if (download) return File(bytes, "application/pdf", "sample-ledger.pdf");

        var extracted = await pdf.ExtractAsync(bytes, "ledger.pdf", ct);
        var grid = extracted!.Grid;
        var mapping = Mapper.AutoDetect(grid);
        var gaps = Mapper.Gaps(mapping);
        var lines = Mapper.Apply(grid, mapping, "statement");

        var checks = new List<object>();
        bool ok = true;
        void Assert(string name, bool pass, object? actual = null)
        {
            ok &= pass;
            checks.Add(new { name, pass, actual });
        }

        Assert("native tier used", extracted.Source == "pdf-native", extracted.Source);
        Assert("grid has header + 4 rows (>=5)", grid.Count >= 5, grid.Count);
        Assert("reference mapped", mapping.Col("reference") >= 0, mapping.Col("reference"));
        Assert("debit_credit mode", mapping.AmountMode == "debit_credit", mapping.AmountMode);
        Assert("no mapping gaps", gaps.Count == 0, gaps);
        Assert("4 data lines parsed", lines.Count == 4, lines.Count);
        Assert("first line debit 1000", lines.Count > 0 && lines[0].Debit == 1000m, lines.FirstOrDefault()?.Debit);
        Assert("references round-tripped", lines.Count == 4 && lines.Select(l => l.Reference).OrderBy(x => x)
            .SequenceEqual(new[] { "INV-1001", "INV-1002", "INV-2001", "INV-3001" }),
            lines.Select(l => l.Reference).ToList());

        return Ok(new { ok, source = extracted.Source, grid, mapping = new { mapping.Columns, mapping.AmountMode, mapping.HeaderRow }, checks });
    }
}
