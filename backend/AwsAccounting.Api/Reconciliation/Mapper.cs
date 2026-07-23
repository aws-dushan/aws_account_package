using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace AwsAccounting.Api.Reconciliation;

/// <summary>
/// A column mapping for one ledger format. Serialises to the same JSON shape used by
/// the TS engine so learned mappings are portable:
/// { "columns": {...}, "amountMode": "...", "positiveIsDebit": bool, "headerRow": n }.
/// </summary>
public class ColumnMapping
{
    [JsonPropertyName("columns")]
    public Dictionary<string, int> Columns { get; set; } = new()
    {
        ["reference"] = -1, ["date"] = -1, ["description"] = -1,
        ["debit"] = -1, ["credit"] = -1, ["amount"] = -1,
    };

    /// <summary>"debit_credit" = separate Dr/Cr columns; "signed" = one +/- Amount column.</summary>
    [JsonPropertyName("amountMode")]
    public string AmountMode { get; set; } = "debit_credit";

    [JsonPropertyName("positiveIsDebit")]
    public bool PositiveIsDebit { get; set; } = true;

    [JsonPropertyName("headerRow")]
    public int HeaderRow { get; set; }

    public int Col(string field) => Columns.TryGetValue(field, out var v) ? v : -1;
}

public static partial class Mapper
{
    [GeneratedRegex("[^a-z0-9]+")] private static partial Regex NonAlnum();
    [GeneratedRegex(@"[^0-9.\-()]")] private static partial Regex NonNumeric();
    [GeneratedRegex(@"^\((.*)\)$")] private static partial Regex Parens();

    private static readonly string[] Fields = ["reference", "date", "description", "debit", "credit", "amount"];

    private static readonly Dictionary<string, string[]> Synonyms = new()
    {
        ["reference"] = ["reference", "ref", "refno", "ref#", "document", "documentno", "docno", "doc#", "voucher", "voucherno", "invoice", "invoiceno", "invno", "billno", "transactionno", "txnno", "chequeno"],
        ["date"] = ["date", "postingdate", "docdate", "documentdate", "transactiondate", "txndate", "valuedate", "entrydate"],
        ["description"] = ["description", "narration", "particulars", "details", "memo", "remarks", "notes", "naration"],
        ["debit"] = ["debit", "dr", "debitamount", "dramount", "withdrawal", "debitaed"],
        ["credit"] = ["credit", "cr", "creditamount", "cramount", "deposit", "creditaed"],
        ["amount"] = ["amount", "amt", "value", "net", "netamount", "transactionamount", "balancemovement"],
    };

    private static string Norm(string? h) => NonAlnum().Replace((h ?? "").ToLowerInvariant(), "");

    private static int FieldScore(string? header, string field)
    {
        var h = Norm(header);
        if (h.Length == 0) return 0;
        int best = 0;
        foreach (var syn in Synonyms[field])
        {
            if (h == syn) best = Math.Max(best, 3);
            else if (h.StartsWith(syn) || syn.StartsWith(h)) best = Math.Max(best, 2);
            else if (h.Contains(syn)) best = Math.Max(best, 1);
        }
        return best;
    }

    public static int DetectHeaderRow(IReadOnlyList<string[]> rows)
    {
        int bestRow = 0, bestScore = -1;
        int limit = Math.Min(rows.Count, 20);
        for (int i = 0; i < limit; i++)
        {
            int score = (rows[i] ?? []).Sum(cell => Fields.Max(f => FieldScore(cell, f)));
            if (score > bestScore) { bestScore = score; bestRow = i; }
        }
        return bestRow;
    }

    public static ColumnMapping AutoDetect(IReadOnlyList<string[]> rows)
    {
        int headerRow = DetectHeaderRow(rows);
        var headers = rows.Count > headerRow ? rows[headerRow] ?? [] : [];
        var columns = Fields.ToDictionary(f => f, _ => -1);

        foreach (var field in Fields)
        {
            int bestCol = -1, bestScore = 0;
            for (int idx = 0; idx < headers.Length; idx++)
            {
                int score = FieldScore(headers[idx], field);
                bool taken = columns.Values.Contains(idx);
                if (score > bestScore && !taken) { bestScore = score; bestCol = idx; }
            }
            columns[field] = bestCol;
        }

        var amountMode = columns["debit"] >= 0 || columns["credit"] >= 0 ? "debit_credit" : "signed";
        return new ColumnMapping { Columns = columns, AmountMode = amountMode, PositiveIsDebit = true, HeaderRow = headerRow };
    }

    private static decimal ToNumber(string? v)
    {
        if (string.IsNullOrEmpty(v)) return 0;
        var s = NonNumeric().Replace(v, "");
        s = Parens().Replace(s, "-$1");
        return decimal.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var n) ? n : 0;
    }

    public static List<RawLine> Apply(IReadOnlyList<string[]> rows, ColumnMapping m, string side)
    {
        var outl = new List<RawLine>();
        static string? At(string[] row, int col) => col >= 0 && col < row.Length ? row[col] : null;

        for (int i = m.HeaderRow + 1; i < rows.Count; i++)
        {
            var row = rows[i] ?? [];
            if (row.All(c => string.IsNullOrWhiteSpace(c))) continue;

            decimal debit = 0, credit = 0;
            if (m.AmountMode == "debit_credit")
            {
                debit = ToNumber(At(row, m.Col("debit")));
                credit = ToNumber(At(row, m.Col("credit")));
            }
            else
            {
                var amt = ToNumber(At(row, m.Col("amount")));
                if (m.PositiveIsDebit)
                {
                    if (amt >= 0) debit = amt; else credit = -amt;
                }
                else
                {
                    if (amt >= 0) credit = amt; else debit = -amt;
                }
            }

            outl.Add(new RawLine(
                side,
                (At(row, m.Col("reference")) ?? "").Trim(),
                At(row, m.Col("date")),
                (At(row, m.Col("description")) ?? "").Trim(),
                debit,
                credit,
                i + 1));
        }
        return outl;
    }

    public static List<string> Gaps(ColumnMapping m)
    {
        var gaps = new List<string>();
        if (m.Col("reference") < 0) gaps.Add("reference");
        if (m.AmountMode == "debit_credit")
        {
            if (m.Col("debit") < 0) gaps.Add("debit");
            if (m.Col("credit") < 0) gaps.Add("credit");
        }
        else if (m.Col("amount") < 0)
        {
            gaps.Add("amount");
        }
        return gaps;
    }

    /// <summary>A stable, order-independent fingerprint of a ledger's header layout.</summary>
    public static string Fingerprint(IReadOnlyList<string[]> rows)
    {
        var headerRow = DetectHeaderRow(rows);
        var headers = (rows.Count > headerRow ? rows[headerRow] ?? [] : [])
            .Select(h => NonAlnum().Replace((h ?? "").Trim().ToLowerInvariant(), ""))
            .Where(h => h.Length > 0)
            .OrderBy(h => h, StringComparer.Ordinal);
        var joined = string.Join("|", headers);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(joined));
        return Convert.ToHexStringLower(hash)[..32];
    }
}
