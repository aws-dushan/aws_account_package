using System.Globalization;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Reconciliation;

/// <summary>Optional AI post-processing (rescue + commentary). P3 wires a live provider; until then it no-ops.</summary>
public interface IAiEnricher
{
    Task RescueMatchesAsync(Guid runId, CancellationToken ct);
    Task GenerateExceptionInsightsAsync(Guid runId, CancellationToken ct);
}

public sealed class NullAiEnricher : IAiEnricher
{
    public Task RescueMatchesAsync(Guid runId, CancellationToken ct) => Task.CompletedTask;
    public Task GenerateExceptionInsightsAsync(Guid runId, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>
/// Full job for a stored run: read its files, resolve column mappings without user
/// confirmation (learned → auto → AI), reconcile, and persist the entire result.
/// AI rescue/insights run afterwards as best-effort enrichment — never altering the
/// deterministic result and never failing the run.
/// </summary>
public sealed class RunProcessor(
    AppDbContext db,
    GridExtractor grids,
    FileStorage storage,
    MappingResolver resolver,
    IAiEnricher ai,
    ILogger<RunProcessor> log)
{
    /// <summary>Reconciliation stages, in order — the UI stepper renders these.</summary>
    public static readonly string[] Stages =
        ["Reading files", "Resolving columns", "Matching", "Saving results", "AI matching", "AI insights", "Completed"];

    public async Task ProcessAsync(Guid runId, CancellationToken ct = default)
    {
        var run = await db.Runs.FirstOrDefaultAsync(r => r.Id == runId, ct)
                  ?? throw new InvalidOperationException("Run not found.");
        if (run.StatementFileId is null || run.CustomerFileId is null)
            throw new InvalidOperationException("Uploaded files are missing.");

        run.Status = "running";
        await SetStage(run, "Reading files", ct);

        var sf = await db.Files.FirstOrDefaultAsync(f => f.Id == run.StatementFileId, ct);
        var cf = await db.Files.FirstOrDefaultAsync(f => f.Id == run.CustomerFileId, ct);
        if (sf is null || cf is null) throw new InvalidOperationException("Uploaded files are no longer available.");

        var statementRows = (await grids.ExtractAsync(await storage.ReadAsync(sf, ct), sf.OriginalName, ct)).Grid;
        var customerRows = (await grids.ExtractAsync(await storage.ReadAsync(cf, ct), cf.OriginalName, ct)).Grid;

        await SetStage(run, "Resolving columns", ct);
        var s = await resolver.ResolveAsync(run.TenantId, statementRows, "statement", ct);
        var c = await resolver.ResolveAsync(run.TenantId, customerRows, "customer", ct);

        var gaps = Mapper.Gaps(s.Mapping).Concat(Mapper.Gaps(c.Mapping)).Distinct().ToList();
        if (gaps.Count > 0)
        {
            static string Head(IReadOnlyList<string[]> rows, ColumnMapping m)
            {
                if (rows.Count <= m.HeaderRow) return "(no header row found)";
                var hs = (rows[m.HeaderRow] ?? []).Where(h => !string.IsNullOrWhiteSpace(h)).ToList();
                return hs.Count == 0 ? "(empty)" : string.Join(", ", hs);
            }
            var diag = $"Statement headers seen: [{Head(statementRows, s.Mapping)}]. Customer headers seen: [{Head(customerRows, c.Mapping)}]";
            log.LogWarning("Run {RunId} mapping gaps: {Gaps}. Statement={SRows} rows ({SSrc}), Customer={CRows} rows ({CSrc}). {Diag}",
                runId, string.Join(",", gaps), statementRows.Count, s.Source, customerRows.Count, c.Source, diag);
            throw new InvalidOperationException(
                $"Could not map required column(s): {string.Join(", ", gaps)}. {diag}. Rename a column to something recognisable (e.g. \"Reference\", \"Invoice No\", \"Doc No\") or check the correct sheet/file was uploaded.");
        }

        await SetStage(run, "Matching", ct);
        var sLines = Mapper.Apply(statementRows, s.Mapping, "statement");
        var cLines = Mapper.Apply(customerRows, c.Mapping, "customer");
        var result = Reconciler.Reconcile(sLines, cLines,
            new ReconcileOptions { AmountTolerance = 1m, FuzzyThreshold = 0.8, PeriodEnd = null });

        await SetStage(run, "Saving results", ct);
        await PersistAsync(run, result, ct);

        // Stage 5 — AI match-rescue (rule-failures only; best-effort).
        try { await SetStage(run, "AI matching", ct); await ai.RescueMatchesAsync(runId, ct); }
        catch (Exception e) { log.LogWarning(e, "AI match-rescue skipped for run {RunId}", runId); }

        // Stage 6 — AI commentary on items still unmatched (best-effort).
        try { await SetStage(run, "AI insights", ct); await ai.GenerateExceptionInsightsAsync(runId, ct); }
        catch (Exception e) { log.LogWarning(e, "AI insights skipped for run {RunId}", runId); }

        await SetStage(run, "Completed", ct);
    }

    private async Task PersistAsync(ReconciliationRun run, ReconcileResult result, CancellationToken ct)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var keyToLine = new Dictionary<string, LedgerLine>();
            foreach (var l in result.Lines)
            {
                var line = new LedgerLine
                {
                    RunId = run.Id,
                    TenantId = run.TenantId,
                    Side = l.Side,
                    Reference = Trunc(l.Reference, 200),
                    NormRef = Trunc(l.NormRef, 200),
                    TxnDate = ToDate(l.Date),
                    Description = Trunc(l.Description, 400),
                    Debit = l.Debit,
                    Credit = l.Credit,
                    Amount = l.Signed,
                    SourceRow = l.SourceRow,
                };
                keyToLine[l.Key] = line;
                db.LedgerLines.Add(line);
            }

            foreach (var m in result.Matches)
            {
                var match = new MatchEntity
                {
                    RunId = run.Id,
                    TenantId = run.TenantId,
                    RuleCode = m.RuleCode,
                    Method = "rule",
                    Confidence = (decimal)m.Confidence,
                    Status = "auto",
                };
                db.Matches.Add(match);
                foreach (var key in m.StatementKeys.Concat(m.CustomerKeys))
                {
                    if (!keyToLine.TryGetValue(key, out var line)) continue;
                    db.MatchLines.Add(new MatchLine { MatchId = match.Id, LedgerLineId = line.Id });
                    line.MatchId = match.Id;
                }
            }

            foreach (var e in result.Exceptions)
            {
                db.Exceptions.Add(new ExceptionRow
                {
                    RunId = run.Id,
                    TenantId = run.TenantId,
                    LedgerLineId = keyToLine.TryGetValue(e.Key, out var line) ? line.Id : null,
                    CategoryCode = e.CategoryCode,
                    Severity = e.Severity,
                    Amount = e.Amount,
                    Status = "open",
                });
            }

            run.Status = "completed";
            run.AutoMatchPct = (decimal)result.Summary.AutoMatchPct;
            run.MatchedValue = result.Summary.MatchedValue;
            run.CompletedAt = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });
    }

    private async Task SetStage(ReconciliationRun run, string stage, CancellationToken ct)
    {
        run.Stage = stage;
        await db.SaveChangesAsync(ct);
    }

    private static string Trunc(string? s, int max)
        => string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..max]);

    private static DateOnly? ToDate(string? s)
        => DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
            ? DateOnly.FromDateTime(dt) : null;
}
