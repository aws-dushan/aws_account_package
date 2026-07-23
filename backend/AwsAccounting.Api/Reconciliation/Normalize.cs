using System.Text.RegularExpressions;

namespace AwsAccounting.Api.Reconciliation;

public static partial class Normalize
{
    [GeneratedRegex(@"[\s\-_/\\.,#:]+")] private static partial Regex Separators();
    [GeneratedRegex("[IL]")] private static partial Regex IL();
    [GeneratedRegex("[^A-Z0-9]")] private static partial Regex NonAlnum();
    [GeneratedRegex(@"\b(carried\s*forward|c/f|b/f|brought\s*forward|opening\s*balance|closing\s*balance|sub\s*total|subtotal|total|balance\s*c/d|balance\s*b/d)\b", RegexOptions.IgnoreCase)]
    private static partial Regex NoiseRe();

    public static string NormalizeReference(string? r)
    {
        var s = (r ?? "").ToUpperInvariant();
        s = Separators().Replace(s, "");
        s = s.Replace("O", "0");
        s = IL().Replace(s, "1");
        s = NonAlnum().Replace(s, "");
        return s;
    }

    public static bool IsNoiseRow(string? description, string? reference)
    {
        var text = $"{reference} {description}".Trim();
        if (text.Length == 0) return true;
        return NoiseRe().IsMatch(description ?? "");
    }

    public static decimal Round2(decimal n) => Math.Round(n, 2, MidpointRounding.AwayFromZero);

    public static List<CanonLine> Canonicalize(IEnumerable<RawLine> raw)
    {
        var outl = new List<CanonLine>();
        int n = 0;
        foreach (var r in raw)
        {
            var reference = (r.Reference ?? "").Trim();
            var description = (r.Description ?? "").Trim();
            var debit = Round2(r.Debit);
            var credit = Round2(r.Credit);
            if (debit == 0 && credit == 0 && reference.Length == 0) continue;
            if (IsNoiseRow(description, reference)) continue;
            var signed = Round2(debit - credit);
            outl.Add(new CanonLine
            {
                Key = $"{r.Side}#{n++}",
                Side = r.Side,
                Reference = reference,
                NormRef = NormalizeReference(reference),
                Date = r.Date,
                Description = description,
                Debit = debit,
                Credit = credit,
                Signed = signed,
                Magnitude = Math.Abs(signed),
                SourceRow = r.SourceRow,
            });
        }
        return outl;
    }
}
