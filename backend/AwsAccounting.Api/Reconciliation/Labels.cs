namespace AwsAccounting.Api.Reconciliation;

public static class Labels
{
    public static readonly Dictionary<string, string> Category = new()
    {
        ["D"] = "Statement only",
        ["E"] = "Customer only",
        ["BAR"] = "Posted after cutoff",
        ["F"] = "Amount difference",
        ["FR"] = "Rounding",
    };

    public static readonly Dictionary<string, string> Rule = new()
    {
        ["R"] = "Exact",
        ["RA"] = "Fuzzy",
        ["RE"] = "Reversal",
        ["F"] = "Amount diff",
        ["1:M"] = "One-to-many",
        ["M:1"] = "Many-to-one",
    };

    /// <summary>Lower = more urgent. r &lt; c &lt; a &lt; n &lt; g.</summary>
    public static readonly Dictionary<string, int> SeverityOrder = new()
    {
        ["r"] = 0, ["c"] = 1, ["a"] = 2, ["n"] = 3, ["g"] = 4,
    };

    public static string CategoryLabel(string code) => Category.TryGetValue(code, out var v) ? v : code;
    public static string RuleLabel(string code) => Rule.TryGetValue(code, out var v) ? v : code;

    /// <summary>Validated pastel palette: (fill, ink) hex per severity band.</summary>
    public static readonly Dictionary<string, (string Fill, string Ink)> Severity = new()
    {
        ["g"] = ("#E3F5E4", "#1B7A2E"),
        ["a"] = ("#FFF3D6", "#8A5A00"),
        ["c"] = ("#FCE6DC", "#A8481A"),
        ["r"] = ("#FBE0E0", "#A62828"),
        ["n"] = ("#EEEDEA", "#565550"),
    };

    public static (string Fill, string Ink) SeverityColors(string sev) => Severity.TryGetValue(sev, out var v) ? v : Severity["n"];
}
