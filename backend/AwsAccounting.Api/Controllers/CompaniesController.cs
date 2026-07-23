using System.Text.RegularExpressions;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/companies")]
[Authorize(Policy = "SuperAdmin")]
public class CompaniesController(AppDbContext db, AuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Tenants.OrderByDescending(t => t.CreatedAt)
            .Select(t => new { t.Id, t.Name, t.Slug, t.IsActive }).ToListAsync());

    public record CreateReq(string Name);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReq req)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length < 2) return BadRequest(new { error = "Enter a company name (at least 2 characters)." });
        var slug = Slugify(name);
        if (slug.Length == 0) return BadRequest(new { error = "Company name must contain letters or numbers." });
        if (await db.Tenants.AnyAsync(t => t.Slug == slug)) return Conflict(new { error = $"A company with the slug \"{slug}\" already exists." });

        var t = new Tenant { Name = name, Slug = slug };
        db.Tenants.Add(t);
        await db.SaveChangesAsync();
        await audit.WriteAsync("company.create", "tenant", t.Id.ToString(), null, new { name, slug });
        return Ok(new { t.Id, t.Name, t.Slug, t.IsActive });
    }

    public record ActiveReq(bool IsActive);

    [HttpPost("{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] ActiveReq req)
    {
        var t = await db.Tenants.FindAsync(id);
        if (t is null) return NotFound();
        t.IsActive = req.IsActive;
        await db.SaveChangesAsync();
        await audit.WriteAsync(req.IsActive ? "company.enable" : "company.disable", "tenant", id.ToString());
        return Ok(new { t.Id, t.IsActive });
    }

    private static string Slugify(string s) =>
        Regex.Replace(s.ToLowerInvariant().Trim(), "[^a-z0-9]+", "-").Trim('-');
}
