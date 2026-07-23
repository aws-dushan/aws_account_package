namespace AwsAccounting.Api.Reconciliation;

/// <summary>A raw ledger line (already split into debit/credit). Side = "statement" | "customer".</summary>
public record RawLine(string Side, string Reference, string? Date = null, string? Description = null, decimal Debit = 0m, decimal Credit = 0m, int? SourceRow = null);

public class CanonLine
{
    public string Key = "";
    public string Side = "";
    public string Reference = "";
    public string NormRef = "";
    public string? Date;
    public string Description = "";
    public decimal Debit;
    public decimal Credit;
    public decimal Signed;
    public decimal Magnitude;
    public int? SourceRow;
}

public record MatchResult(string RuleCode, double Confidence, List<string> StatementKeys, List<string> CustomerKeys, decimal Amount, bool Rounding);

public record ExceptionResult(string Key, string Side, string CategoryCode, string Severity, decimal Amount, string Reference, string Description);

public class ReconcileOptions
{
    public decimal AmountTolerance { get; set; } = 1m;
    public double FuzzyThreshold { get; set; } = 0.8;
    public string? PeriodEnd { get; set; }
}

public class ReconcileSummary
{
    public int StatementCount { get; set; }
    public int CustomerCount { get; set; }
    public int MatchedLines { get; set; }
    public int ExceptionCount { get; set; }
    public double AutoMatchPct { get; set; }
    public decimal MatchedValue { get; set; }
}

public class ReconcileResult
{
    public List<CanonLine> Lines { get; set; } = [];
    public List<MatchResult> Matches { get; set; } = [];
    public List<ExceptionResult> Exceptions { get; set; } = [];
    public List<string> NettedKeys { get; set; } = [];
    public ReconcileSummary Summary { get; set; } = new();
}

public static class CategorySeverity
{
    public static readonly Dictionary<string, string> Map = new()
    {
        ["D"] = "r", ["E"] = "r", ["BAR"] = "a", ["F"] = "c", ["FR"] = "n",
    };
}
