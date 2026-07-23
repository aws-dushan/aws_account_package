using System.Globalization;
using System.Text.RegularExpressions;

namespace AwsAccounting.Api.Reconciliation;

/// <summary>
/// Deterministic reconciliation engine. Format-agnostic: consumes already-split
/// debit/credit RawLines. AI enrichment happens later and never alters these results.
/// Ported verbatim from the verified TypeScript engine.
/// </summary>
public static partial class Reconciler
{
    [GeneratedRegex(@"\brevers", RegexOptions.IgnoreCase)] private static partial Regex ReversalRe();

    public static ReconcileResult Reconcile(IEnumerable<RawLine> rawStatement, IEnumerable<RawLine> rawCustomer, ReconcileOptions? opts = null)
    {
        opts ??= new ReconcileOptions();
        decimal tol = opts.AmountTolerance;
        double fuzzy = opts.FuzzyThreshold;
        DateTime? cutoff = DateTime.TryParse(opts.PeriodEnd, CultureInfo.InvariantCulture, DateTimeStyles.None, out var cdt) ? cdt : null;

        var all = Normalize.Canonicalize(
            rawStatement.Select(r => r with { Side = "statement" })
                .Concat(rawCustomer.Select(r => r with { Side = "customer" })));
        var S = all.Where(l => l.Side == "statement").ToList();
        var C = all.Where(l => l.Side == "customer").ToList();

        var used = ReversalNetting(S, tol);
        var netted = new List<string>(used);
        bool Avail(CanonLine l) => !used.Contains(l.Key);

        var matches = new List<MatchResult>();
        var exceptions = new List<ExceptionResult>();

        void AddMatch(string rule, List<CanonLine> sk, List<CanonLine> ck, double conf)
        {
            var amount = Normalize.Round2(sk.Sum(l => l.Magnitude));
            var cAmount = Normalize.Round2(ck.Sum(l => l.Magnitude));
            foreach (var l in sk.Concat(ck)) used.Add(l.Key);
            matches.Add(new MatchResult(rule, conf, sk.Select(l => l.Key).ToList(), ck.Select(l => l.Key).ToList(), amount, Math.Abs(amount - cAmount) > 0.005m));
        }

        // R — exact reference + amount
        foreach (var s in S)
        {
            if (!Avail(s)) continue;
            var c = C.FirstOrDefault(x => Avail(x) && x.NormRef == s.NormRef && Math.Abs(x.Magnitude - s.Magnitude) < tol);
            if (c != null) AddMatch("R", [s], [c], 1);
        }

        // RA — fuzzy reference, exact amount
        foreach (var s in S)
        {
            if (!Avail(s)) continue;
            CanonLine? best = null;
            double bestSim = fuzzy;
            foreach (var c in C)
            {
                if (!Avail(c)) continue;
                if (Math.Abs(c.Magnitude - s.Magnitude) >= tol) continue;
                var sim = Similarity.Sim(s.NormRef, c.NormRef);
                if (sim >= bestSim) { bestSim = sim; best = c; }
            }
            if (best != null) AddMatch("RA", [s], [best], Math.Round(bestSim, 3));
        }

        // 1:M — one statement line ↔ many customer lines summing to it
        foreach (var s in S)
        {
            if (!Avail(s)) continue;
            var group = C.Where(c => Avail(c) && c.NormRef == s.NormRef).ToList();
            if (group.Count >= 2 && Math.Abs(Sum(group) - s.Magnitude) < tol) AddMatch("1:M", [s], group, 0.9);
        }

        // M:1 — many statement lines ↔ one customer line
        foreach (var c in C)
        {
            if (!Avail(c)) continue;
            var group = S.Where(s => Avail(s) && s.NormRef == c.NormRef).ToList();
            if (group.Count >= 2 && Math.Abs(Sum(group) - c.Magnitude) < tol) AddMatch("M:1", group, [c], 0.9);
        }

        // F — same reference, differing amount (rounding / partial dispute)
        foreach (var s in S)
        {
            if (!Avail(s)) continue;
            var c = C.FirstOrDefault(x => Avail(x) && x.NormRef == s.NormRef);
            if (c != null)
            {
                used.Add(s.Key);
                used.Add(c.Key);
                PushEx(exceptions, s, "F", Normalize.Round2(Math.Abs(s.Magnitude - c.Magnitude)));
            }
        }

        // Classification of what's left over — D (statement-only), E (customer-only), BAR (beyond period)
        foreach (var l in S.Concat(C))
        {
            if (!Avail(l)) continue;
            used.Add(l.Key);
            string cat;
            if (cutoff != null && l.Date != null && DateTime.TryParse(l.Date, CultureInfo.InvariantCulture, DateTimeStyles.None, out var ld) && ld > cutoff)
                cat = "BAR";
            else
                cat = l.Side == "statement" ? "D" : "E";
            PushEx(exceptions, l, cat, l.Magnitude);
        }

        int matchedLines = matches.Sum(m => m.StatementKeys.Count + m.CustomerKeys.Count) + netted.Count;
        int total = S.Count + C.Count;

        return new ReconcileResult
        {
            Lines = all,
            Matches = matches,
            Exceptions = exceptions,
            NettedKeys = netted,
            Summary = new ReconcileSummary
            {
                StatementCount = S.Count,
                CustomerCount = C.Count,
                MatchedLines = matchedLines,
                ExceptionCount = exceptions.Count,
                AutoMatchPct = total > 0 ? (double)Normalize.Round2((decimal)((double)matchedLines / total * 100)) : 0,
                MatchedValue = Normalize.Round2(matches.Sum(m => m.Amount)),
            },
        };
    }

    private static decimal Sum(List<CanonLine> l) => Normalize.Round2(l.Sum(x => x.Magnitude));

    private static void PushEx(List<ExceptionResult> list, CanonLine l, string cat, decimal amount)
        => list.Add(new ExceptionResult(l.Key, l.Side, cat, CategorySeverity.Map[cat], amount, l.Reference, l.Description));

    /// <summary>Nets same-side reversal pairs (opposite sign, equal magnitude) before matching.</summary>
    private static HashSet<string> ReversalNetting(List<CanonLine> statement, decimal tol)
    {
        var netted = new HashSet<string>();
        foreach (var L in statement)
        {
            if (netted.Contains(L.Key)) continue;
            if (!ReversalRe().IsMatch(L.Description ?? "")) continue;
            CanonLine? best = null;
            foreach (var M in statement)
            {
                if (M.Key == L.Key || netted.Contains(M.Key)) continue;
                if (Math.Abs(M.Magnitude - L.Magnitude) > tol) continue;
                if (Math.Sign(M.Signed) == Math.Sign(L.Signed)) continue;
                if (!string.IsNullOrEmpty(M.Reference) && (L.Description ?? "").ToUpperInvariant().Contains(M.Reference.ToUpperInvariant()))
                {
                    best = M;
                    break;
                }
                best ??= M;
            }
            if (best != null)
            {
                netted.Add(L.Key);
                netted.Add(best.Key);
            }
        }
        return netted;
    }
}
