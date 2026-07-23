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
[Route("api/runs")]
[Authorize]
public class RunsController(
    AppDbContext db,
    CurrentUser me,
    PermissionService perms,
    FileStorage storage,
    RunQueue queue,
    ReportExporter exporter,
    AuditService audit) : ControllerBase
{
    private static readonly string[] AllowedExt = [".xlsx", ".xls", ".csv", ".pdf"];

    private IActionResult Deny(string key) => StatusCode(403, new { error = $"Missing permission: {key}" });

    /// <summary>The tenant this request acts on. Company users are pinned to their own tenant; super-admins pick one.</summary>
    private Guid? ResolveTenant(Guid? requested) => me.TenantId ?? requested;

    // ---- create ---------------------------------------------------------------
    [HttpPost]
    [RequestSizeLimit(60_000_000)]
    public async Task<IActionResult> Create([FromForm] string name, [FromForm] IFormFile statement, [FromForm] IFormFile customer, [FromForm] Guid? tenantId, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.run.create", ct)) return Deny("ar-reconciliation.run.create");

        var tid = ResolveTenant(tenantId);
        if (tid is null) return BadRequest(new { error = "Select a company for this run." });
        if (!await db.Tenants.AnyAsync(t => t.Id == tid, ct)) return BadRequest(new { error = "Unknown company." });
        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { error = "Enter a run name." });
        if (statement is null || customer is null) return BadRequest(new { error = "Both the statement and customer ledger files are required." });

        foreach (var f in new[] { statement, customer })
        {
            var ext = Path.GetExtension(f.FileName).ToLowerInvariant();
            if (!AllowedExt.Contains(ext)) return BadRequest(new { error = $"Unsupported file type: {ext}. Upload Excel, CSV, or PDF." });
        }

        var sf = await storage.SaveAsync(tid.Value, "statement", await ToBytes(statement, ct), statement.FileName, statement.ContentType, me.Id, ct);
        var cf = await storage.SaveAsync(tid.Value, "customer", await ToBytes(customer, ct), customer.FileName, customer.ContentType, me.Id, ct);

        var run = new ReconciliationRun
        {
            TenantId = tid.Value,
            Name = name.Trim(),
            Status = "queued",
            StatementFileId = sf.Id,
            CustomerFileId = cf.Id,
            CreatedBy = me.Id,
        };
        db.Runs.Add(run);
        await db.SaveChangesAsync(ct);

        await queue.EnqueueAsync(run.Id, ct);
        await audit.WriteAsync("run.create", "reconciliation_run", run.Id.ToString(), tid, new { run.Name });

        return Ok(new { run.Id, run.Status });
    }

    // ---- list -----------------------------------------------------------------
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? tenantId, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.view", ct)) return Deny("ar-reconciliation.view");
        var q = db.Runs.AsNoTracking().AsQueryable();
        var scope = me.TenantId ?? tenantId;
        if (scope is not null) q = q.Where(r => r.TenantId == scope);

        var rows = await q.OrderByDescending(r => r.CreatedAt).Take(200)
            .Select(r => new
            {
                r.Id, r.Name, r.Status, r.Stage, r.AutoMatchPct, r.MatchedValue, r.Error, r.CreatedAt, r.CompletedAt, r.TenantId,
                CreatedByName = db.Users.Where(u => u.Id == r.CreatedBy).Select(u => u.DisplayName).FirstOrDefault(),
            })
            .ToListAsync(ct);
        return Ok(rows);
    }

    // ---- detail (status / progress) -------------------------------------------
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.view", ct)) return Deny("ar-reconciliation.view");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();

        var company = await db.Tenants.AsNoTracking().Where(t => t.Id == run.TenantId).Select(t => t.Name).FirstOrDefaultAsync(ct);
        var lines = await db.LedgerLines.CountAsync(l => l.RunId == id, ct);
        var matchCount = await db.Matches.CountAsync(m => m.RunId == id, ct);
        var exOpen = await db.Exceptions.CountAsync(e => e.RunId == id && e.Status == "open", ct);
        var exTotal = await db.Exceptions.CountAsync(e => e.RunId == id, ct);

        return Ok(new
        {
            run.Id, run.Name, run.Status, run.Stage, run.AutoMatchPct, run.MatchedValue, run.Error, run.CreatedAt, run.CompletedAt,
            company,
            counts = new { lines, matches = matchCount, exceptionsOpen = exOpen, exceptionsTotal = exTotal },
            stages = RunProcessor.Stages,
        });
    }

    // ---- full results ---------------------------------------------------------
    [HttpGet("{id:guid}/results")]
    public async Task<IActionResult> Results(Guid id, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.view", ct)) return Deny("ar-reconciliation.view");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();

        var data = await exporter.BuildDataAsync(id, ct);
        return Ok(new
        {
            run = new { run.Id, run.Name, run.Status, run.AutoMatchPct, run.MatchedValue },
            data.Counts,
            data.CategoryBreakdown,
            lines = data.Lines,
            exceptions = data.Exceptions,
        });
    }

    // ---- exports --------------------------------------------------------------
    [HttpGet("{id:guid}/export/excel")]
    public async Task<IActionResult> ExportExcel(Guid id, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.report.export", ct)) return Deny("ar-reconciliation.report.export");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();
        var data = await exporter.BuildDataAsync(id, ct);
        var bytes = exporter.BuildWorkbook(data);
        await audit.WriteAsync("run.export", "reconciliation_run", id.ToString(), run.TenantId, new { format = "excel" });
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Filename(run.Name, "xlsx"));
    }

    [HttpGet("{id:guid}/export/pdf")]
    public async Task<IActionResult> ExportPdf(Guid id, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.report.export", ct)) return Deny("ar-reconciliation.report.export");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();
        var data = await exporter.BuildDataAsync(id, ct);
        var bytes = exporter.BuildPdf(data);
        await audit.WriteAsync("run.export", "reconciliation_run", id.ToString(), run.TenantId, new { format = "pdf" });
        return File(bytes, "application/pdf", Filename(run.Name, "pdf"));
    }

    // ---- original source documents -------------------------------------------
    [HttpGet("{id:guid}/source/{which}")]
    public async Task<IActionResult> Source(Guid id, string which, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.view", ct)) return Deny("ar-reconciliation.view");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();

        var fileId = which switch
        {
            "statement" => run.StatementFileId,
            "customer" => run.CustomerFileId,
            _ => (Guid?)null,
        };
        if (fileId is null) return NotFound();

        var rec = await db.Files.AsNoTracking().FirstOrDefaultAsync(f => f.Id == fileId.Value, ct);
        if (rec is null) return NotFound();

        var bytes = await storage.ReadAsync(rec, ct);
        var name = string.IsNullOrWhiteSpace(rec.OriginalName) ? $"{which}" : rec.OriginalName;
        return File(bytes, rec.Mime ?? "application/octet-stream", name);
    }

    // ---- on-demand AI commentary ---------------------------------------------
    [HttpPost("{id:guid}/ai-insights")]
    public async Task<IActionResult> AiInsights(Guid id, [FromServices] AwsAccounting.Api.Reconciliation.IAiEnricher ai, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.view", ct)) return Deny("ar-reconciliation.view");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();
        try
        {
            await ai.GenerateExceptionInsightsAsync(id, ct);
        }
        catch (AiNotConfiguredException)
        {
            return BadRequest(new { error = "Configure a reasoning model in Admin → AI Settings first." });
        }
        catch
        {
            return BadRequest(new { error = "AI insight generation failed. Check the AI provider configuration." });
        }
        await audit.WriteAsync("run.ai_insights", "reconciliation_run", id.ToString(), run.TenantId);
        return Ok(new { ok = true });
    }

    // ---- delete ---------------------------------------------------------------
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!await perms.CanAsync("ar-reconciliation.run.delete", ct)) return Deny("ar-reconciliation.run.delete");
        var run = await LoadScoped(id, ct);
        if (run is null) return NotFound();

        await db.MatchLines.Where(x => db.Matches.Any(m => m.Id == x.MatchId && m.RunId == id)).ExecuteDeleteAsync(ct);
        await db.Matches.Where(m => m.RunId == id).ExecuteDeleteAsync(ct);
        await db.Exceptions.Where(e => e.RunId == id).ExecuteDeleteAsync(ct);
        await db.LedgerLines.Where(l => l.RunId == id).ExecuteDeleteAsync(ct);
        await db.Runs.Where(r => r.Id == id).ExecuteDeleteAsync(ct);

        await audit.WriteAsync("run.delete", "reconciliation_run", id.ToString(), run.TenantId, new { run.Name });
        return Ok(new { ok = true });
    }

    private async Task<ReconciliationRun?> LoadScoped(Guid id, CancellationToken ct)
    {
        var run = await db.Runs.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, ct);
        if (run is null) return null;
        if (me.TenantId is Guid t && run.TenantId != t) return null; // tenant isolation
        return run;
    }

    private static async Task<byte[]> ToBytes(IFormFile f, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        await f.CopyToAsync(ms, ct);
        return ms.ToArray();
    }

    private static string Filename(string runName, string ext)
    {
        var safe = new string(runName.Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray()).Trim('_');
        if (safe.Length == 0) safe = "reconciliation";
        return $"{safe}.{ext}";
    }
}
