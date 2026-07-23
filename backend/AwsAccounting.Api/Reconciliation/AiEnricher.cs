using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Reconciliation;

/// <summary>
/// Live AI enrichment (P3). Touches <b>only rule-failures</b> — deterministic matches are never
/// altered. Best-effort: if AI is unconfigured/unreachable these throw and the run's caller
/// (<see cref="RunProcessor"/>) skips the stage. Ported from the TS <c>ai-enrich.ts</c>.
/// </summary>
public sealed class AiEnricher(AppDbContext db, AiClient ai, ILogger<AiEnricher> log) : IAiEnricher
{
    private sealed record RescuePair(int I, int J, double Confidence, string? Reason);
    private sealed record RescueResult(List<RescuePair>? Pairs);
    private sealed record Insight(int I, string? Explanation, string? Recommendation);
    private sealed record InsightResult(List<Insight>? Insights);

    private sealed record OpenItem(Guid ExId, Guid? LineId, string Category, string? Ref, string? Desc, decimal Amount);

    /// <summary>
    /// Stage 5 — AI match-rescue. For statement-only (D) and customer-only (E) rule-failures,
    /// ask the model to propose pairs the rules missed. Confident pairs become an "ai_suggested"
    /// match linking both lines; the two exceptions are flagged ai_suggested for confirmation.
    /// </summary>
    public async Task RescueMatchesAsync(Guid runId, CancellationToken ct)
    {
        const double threshold = 0.7;
        var run = await db.Runs.AsNoTracking().Where(r => r.Id == runId).Select(r => new { r.TenantId }).FirstOrDefaultAsync(ct);
        if (run is null) return;

        var open = await LoadOpenAsync(runId, ct);
        var stmt = open.Where(e => e.Category == "D" && e.LineId != null).ToList();
        var cust = open.Where(e => e.Category == "E" && e.LineId != null).ToList();
        if (stmt.Count == 0 || cust.Count == 0) return;

        const string system =
            "You reconcile accounting ledgers. Given statement-only and customer-only items the rules could NOT match, " +
            "propose pairs that are the SAME underlying transaction (reference typed differently, transposed digits, same amount + description). " +
            "Only propose confident pairs. JSON only.";
        var user =
            $"Statement-only:\n{System.Text.Json.JsonSerializer.Serialize(stmt.Select((e, i) => new { i, reference = e.Ref, description = e.Desc, amount = e.Amount }))}\n" +
            $"Customer-only:\n{System.Text.Json.JsonSerializer.Serialize(cust.Select((e, j) => new { j, reference = e.Ref, description = e.Desc, amount = e.Amount }))}\n\n" +
            "Return {\"pairs\":[{\"i\":<statement index>,\"j\":<customer index>,\"confidence\":0..1,\"reason\":\"...\"}]}";

        var outp = await ai.JsonAsync<RescueResult>(system, user, maxTokens: 1500, ct: ct);

        var usedS = new HashSet<int>();
        var usedC = new HashSet<int>();
        int created = 0;
        foreach (var p in outp?.Pairs ?? [])
        {
            if (p.Confidence < threshold || usedS.Contains(p.I) || usedC.Contains(p.J)) continue;
            if (p.I < 0 || p.I >= stmt.Count || p.J < 0 || p.J >= cust.Count) continue;
            var s = stmt[p.I];
            var c = cust[p.J];
            if (s.LineId is not Guid sLine || c.LineId is not Guid cLine) continue;
            usedS.Add(p.I);
            usedC.Add(p.J);

            var strategy = db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                var match = new MatchEntity
                {
                    RunId = runId,
                    TenantId = run.TenantId,
                    RuleCode = "RA",
                    Method = "ai",
                    Confidence = (decimal)Math.Min(0.999, p.Confidence),
                    Status = "ai_suggested",
                };
                db.Matches.Add(match);
                db.MatchLines.Add(new MatchLine { MatchId = match.Id, LedgerLineId = sLine });
                db.MatchLines.Add(new MatchLine { MatchId = match.Id, LedgerLineId = cLine });

                var lines = await db.LedgerLines.Where(l => l.Id == sLine || l.Id == cLine).ToListAsync(ct);
                foreach (var l in lines) l.MatchId = match.Id;

                var exRows = await db.Exceptions.Where(e => e.Id == s.ExId || e.Id == c.ExId).ToListAsync(ct);
                foreach (var e in exRows)
                {
                    e.Status = "ai_suggested";
                    e.AiExplanation = Trunc($"Possible match: {s.Ref} ↔ {c.Ref}. {p.Reason}", 600);
                    e.AiRecommendation = "Confirm if this is the same transaction; otherwise reject.";
                }

                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            });
            created++;
        }
        if (created > 0) log.LogInformation("AI rescue created {Count} suggested match(es) for run {RunId}", created, runId);
    }

    /// <summary>
    /// Stage 6 — AI commentary. For each still-open rule-failure, ask the reasoning model for a
    /// one-sentence explanation + recommended action. The AI never alters match results.
    /// </summary>
    public async Task GenerateExceptionInsightsAsync(Guid runId, CancellationToken ct)
    {
        var rows = await LoadOpenAsync(runId, ct);
        if (rows.Count == 0) return;

        var model = await db.AiSettings.AsNoTracking().Where(a => a.Purpose == "reasoning").Select(a => a.Model).FirstOrDefaultAsync(ct);

        var items = rows.Select((r, i) => new
        {
            i,
            category = Labels.CategoryLabel(r.Category),
            reference = r.Ref ?? "",
            description = r.Desc ?? "",
            amount = r.Amount,
        });

        const string system =
            "You are an accounts-receivable reconciliation assistant. For each unreconciled item, " +
            "give a ONE-sentence plain-English explanation of why it most likely did not reconcile, " +
            "and a ONE-sentence recommended next action naming who should do what. Be specific and concise. JSON only.";
        var user =
            $"Unreconciled items (AWS Distribution statement vs customer ledger):\n{System.Text.Json.JsonSerializer.Serialize(items)}\n\n" +
            "Return exactly: {\"insights\":[{\"i\":<index>,\"explanation\":\"...\",\"recommendation\":\"...\"}]}";

        var outp = await ai.JsonAsync<InsightResult>(system, user, maxTokens: 2000, ct: ct);

        foreach (var ins in outp?.Insights ?? [])
        {
            if (ins.I < 0 || ins.I >= rows.Count) continue;
            var row = rows[ins.I];
            var ex = await db.Exceptions.FirstOrDefaultAsync(e => e.Id == row.ExId, ct);
            if (ex is null) continue;
            ex.AiExplanation = Trunc(ins.Explanation, 600);
            ex.AiRecommendation = Trunc(ins.Recommendation, 600);
            ex.AiModel = model;
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task<List<OpenItem>> LoadOpenAsync(Guid runId, CancellationToken ct) =>
        await (from e in db.Exceptions.AsNoTracking()
               where e.RunId == runId && e.Status == "open"
               join l in db.LedgerLines.AsNoTracking() on e.LedgerLineId equals l.Id into lj
               from l in lj.DefaultIfEmpty()
               select new OpenItem(e.Id, e.LedgerLineId, e.CategoryCode, l != null ? l.Reference : null, l != null ? l.Description : null, l != null ? l.Amount : 0m))
            .ToListAsync(ct);

    private static string? Trunc(string? s, int max)
        => string.IsNullOrEmpty(s) ? null : (s.Length <= max ? s : s[..max]);
}
