using System.Text.Json;
using AwsAccounting.Api.Services;

namespace AwsAccounting.Api.Reconciliation;

/// <summary>
/// Identifies a column mapping via the configured reasoning model when auto-detect leaves gaps.
/// Ported from the TS <c>mapping-resolver.ts → aiIdentifyMapping</c>. Declines (returns null)
/// when AI is unconfigured, so the resolver falls back to the best-effort auto mapping.
/// </summary>
public sealed class AiMappingIdentifier(AiClient ai, ILogger<AiMappingIdentifier> log) : IAiMappingIdentifier
{
    private sealed record AiMap(int? Reference, int? Date, int? Description, int? Debit, int? Credit, int? Amount, string? AmountMode, bool? PositiveIsDebit);

    public async Task<ColumnMapping?> IdentifyAsync(IReadOnlyList<string[]> rows, ColumnMapping auto, CancellationToken ct)
    {
        var headerRow = auto.HeaderRow;
        var headers = rows.Count > headerRow ? rows[headerRow] ?? [] : [];
        var sample = rows.Skip(headerRow + 1).Take(5).ToList();

        const string system = "You map accounting-ledger spreadsheet columns to canonical fields. Respond with JSON only, no prose.";
        var user =
            $"Header cells (0-indexed): {JsonSerializer.Serialize(headers)}\n" +
            $"Sample data rows: {JsonSerializer.Serialize(sample)}\n\n" +
            "Return JSON exactly: {\"reference\":n,\"date\":n,\"description\":n,\"debit\":n,\"credit\":n,\"amount\":n,\"amountMode\":\"debit_credit\"|\"signed\",\"positiveIsDebit\":true|false} " +
            "where n is the 0-based column index or -1 if absent. Use \"debit_credit\" when there are separate debit and credit columns; use \"signed\" for a single +/- amount column (then set positiveIsDebit).";

        AiMap? j;
        try
        {
            j = await ai.JsonAsync<AiMap>(system, user, maxTokens: 500, ct: ct);
        }
        catch (AiNotConfiguredException)
        {
            return null;
        }
        catch (Exception e)
        {
            log.LogWarning(e, "AI mapping identification failed");
            return null;
        }
        if (j is null) return null;

        var columns = new Dictionary<string, int>
        {
            ["reference"] = Num(j.Reference),
            ["date"] = Num(j.Date),
            ["description"] = Num(j.Description),
            ["debit"] = Num(j.Debit),
            ["credit"] = Num(j.Credit),
            ["amount"] = Num(j.Amount),
        };
        var amountMode = j.AmountMode == "signed"
            ? "signed"
            : (columns["debit"] >= 0 || columns["credit"] >= 0 ? "debit_credit" : "signed");

        return new ColumnMapping
        {
            Columns = columns,
            AmountMode = amountMode,
            PositiveIsDebit = j.PositiveIsDebit != false,
            HeaderRow = headerRow,
        };
    }

    private static int Num(int? v) => v ?? -1;
}
