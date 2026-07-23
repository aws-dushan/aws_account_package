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
                e.AiExplanation, e.AiRecommendation, e.ResolutionNote,
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
        => Resolve(id, "approved", "ar-reconciliation.exception.approve", req?.Note, ct);

    // ---- adjust ---------------------------------------------------------------
    [HttpPost("exceptions/{id:guid}/adjust")]
    public Task<IActionResult> Adjust(Guid id, [FromBody] ResolveReq? req, CancellationToken ct)
        => Resolve(id, "adjusted", "ar-reconciliation.exception.adjust", req?.Note, ct);

    private async Task<IActionResult> Resolve(Guid id, string status, string permKey, string? note, CancellationToken ct)
    {
        if (!await perms.CanAsync(permKey, ct)) return Deny(permKey);

        var ex = await db.Exceptions.FirstOrDefaultAsync(e => e.Id == id, ct);
        if (ex is null) return NotFound();
        if (!await RunInScope(ex.RunId, ct)) return NotFound();

        ex.Status = status;
        ex.ResolvedBy = me.Id;
        ex.ResolutionNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        await db.SaveChangesAsync(ct);

        await audit.WriteAsync($"exception.{status}", "reconciliation_exception", id.ToString(), ex.TenantId, new { ex.CategoryCode, note });
        return Ok(new { ex.Id, ex.Status });
    }

    /// <summary>True if the run exists and the caller's tenant may see it.</summary>
    private async Task<bool> RunInScope(Guid runId, CancellationToken ct)
    {
        var run = await db.Runs.AsNoTracking().Where(r => r.Id == runId).Select(r => new { r.TenantId }).FirstOrDefaultAsync(ct);
        if (run is null) return false;
        return me.TenantId is not Guid t || run.TenantId == t;
    }
}
