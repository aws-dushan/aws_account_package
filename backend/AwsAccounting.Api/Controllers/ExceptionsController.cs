using AwsAccounting.Api.Auth;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Reconciliation;
using AwsAccounting.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class ExceptionsController(AppDbContext db, CurrentUser me, PermissionService perms, AuditService audit) : ControllerBase
{
    private IActionResult Deny(string key) => StatusCode(403, new { error = $"Missing permission: {key}" });

    // ---- list a run's exceptions ---------------------------------------------
    [HttpGet("runs/{runId:guid}/exceptions")]
    public async Task<IActionResult> List(Guid runId, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.view", ct)) return Deny("ar-reconciliation.view");
        if (!await RunInScope(runId, ct)) return NotFound();

        var rows = await (
            from e in db.Exceptions.AsNoTracking()
            where e.RunId == runId
            join l in db.LedgerLines.AsNoTracking() on e.LedgerLineId equals l.Id into lj
            from l in lj.DefaultIfEmpty()
            select new
            {
                e.Id, e.CategoryCode, e.Severity, e.Amount, e.Status,
                e.AiExplanation, e.AiRecommendation, e.AiModel, e.ResolutionNote,
                reference = l != null ? l.Reference : null,
                description = l != null ? l.Description : null,
                side = l != null ? l.Side : null,
                categoryLabel = Labels.CategoryLabel(e.CategoryCode),
            }).ToListAsync(ct);

        var ordered = rows
            .OrderBy(r => Labels.SeverityOrder.GetValueOrDefault(r.Severity, 9))
            .ThenByDescending(r => r.Amount ?? 0m)
            .ToList();
        return Ok(ordered);
    }

    public record ResolveReq(string? Note);

    // ---- approve --------------------------------------------------------------
    [HttpPost("exceptions/{id:guid}/approve")]
    public Task<IActionResult> Approve(Guid id, [FromBody] ResolveReq? req, CancellationToken ct)
        => Resolve(id, "approved", req?.Note, ct);

    // ---- adjust ---------------------------------------------------------------
    [HttpPost("exceptions/{id:guid}/adjust")]
    public Task<IActionResult> Adjust(Guid id, [FromBody] ResolveReq? req, CancellationToken ct)
        => Resolve(id, "adjusted", req?.Note, ct);

    public record ResolveStatusReq(string Status, string? Note);

    private static readonly string[] ResolvableStatuses = ["open", "approved", "adjusted", "resolved"];

    // ---- generic resolve (approve / adjust / resolve / reopen) -----------------
    [HttpPost("exceptions/{id:guid}/resolve")]
    public Task<IActionResult> ResolveStatus(Guid id, [FromBody] ResolveStatusReq req, CancellationToken ct)
    {
        if (req is null || !ResolvableStatuses.Contains(req.Status))
            return Task.FromResult<IActionResult>(BadRequest(new { error = "Invalid status." }));
        return Resolve(id, req.Status, req.Note, ct);
    }

    private async Task<IActionResult> Resolve(Guid id, string status, string? note, CancellationToken ct)
    {
        // Adjusting needs the adjust permission; every other transition needs approve.
        var permKey = status == "adjusted" ? "ar-reconciliation.exception.adjust" : "ar-reconciliation.exception.approve";
        if (!await perms.CanAsync(permKey, ct)) return Deny(permKey);

        var ex = await db.Exceptions.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (ex is null) return NotFound();
        if (!await RunInScope(ex.RunId, ct)) return NotFound();

        ex.Status = status;
        ex.ResolvedBy = status == "open" ? null : me.Id;
        ex.ResolutionNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, 1000)];
        await db.SaveChangesAsync(ct);

        await audit.WriteAsync($"exception.{status}", "reconciliation_exception", id.ToString(), ex.TenantId, new { ex.CategoryCode });
        return Ok(new { ex.Id, ex.Status });
    }

    public record AiMatchReq(bool Accept);

    /// <summary>
    /// Confirm or reject an AI-suggested match. Accept → the match becomes user_confirmed and both
    /// exceptions resolve; reject → the suggested match is removed and the exceptions reopen.
    /// </summary>
    [HttpPost("exceptions/{id:guid}/ai-match")]
    public async Task<IActionResult> ConfirmAiMatch(Guid id, [FromBody] AiMatchReq req, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.exception.approve", ct)) return Deny("ar-reconciliation.exception.approve");

        var ex = await db.Exceptions.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);
        if (ex is null) return NotFound();
        if (!await RunInScope(ex.RunId, ct)) return NotFound();
        if (ex.LedgerLineId is not Guid lineId) return BadRequest(new { error = "No linked line." });

        var matchId = await db.LedgerLines.Where(l => l.Id == lineId).Select(l => l.MatchId).FirstOrDefaultAsync(ct);
        if (matchId is not Guid mid) return BadRequest(new { error = "No suggested match to confirm." });

        var lineIds = await db.MatchLines.Where(x => x.MatchId == mid).Select(x => x.LedgerLineId).ToListAsync(ct);
        var exIds = await db.Exceptions.Where(e => e.LedgerLineId != null && lineIds.Contains(e.LedgerLineId.Value)).Select(e => e.Id).ToListAsync(ct);

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            if (req.Accept)
            {
                await db.Matches.Where(m => m.Id == mid)
                    .ExecuteUpdateAsync(s => s.SetProperty(m => m.Status, "user_confirmed"), ct);
                await db.Exceptions.Where(e => exIds.Contains(e.Id))
                    .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, "resolved").SetProperty(e => e.ResolvedBy, me.Id), ct);
            }
            else
            {
                await db.LedgerLines.Where(l => lineIds.Contains(l.Id))
                    .ExecuteUpdateAsync(s => s.SetProperty(l => l.MatchId, (Guid?)null), ct);
                await db.MatchLines.Where(x => x.MatchId == mid).ExecuteDeleteAsync(ct);
                await db.Matches.Where(m => m.Id == mid).ExecuteDeleteAsync(ct);
                await db.Exceptions.Where(e => exIds.Contains(e.Id))
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(e => e.Status, "open")
                        .SetProperty(e => e.AiExplanation, (string?)null)
                        .SetProperty(e => e.AiRecommendation, (string?)null), ct);
            }
            await tx.CommitAsync(ct);
        });

        await audit.WriteAsync(req.Accept ? "reconciliation.ai_match.confirm" : "reconciliation.ai_match.reject",
            "reconciliation_exception", id.ToString(), ex.TenantId);
        return Ok(new { ok = true, accepted = req.Accept });
    }

    /// <summary>True if the run exists and the caller's tenant may see it.</summary>
    private async Task<bool> RunInScope(Guid runId, CancellationToken ct)
    {
        var run = await db.Runs.AsNoTracking().Where(r => r.Id == runId).Select(r => new { r.TenantId }).FirstOrDefaultAsync(ct);
        if (run is null) return false;
        return me.TenantId is not Guid t || run.TenantId == t;
    }
}
