using AwsAccounting.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/audit")]
[Authorize(Policy = "SuperAdmin")]
public class AuditController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.AuditEntries.OrderByDescending(a => a.CreatedAt).Take(200)
            .Select(a => new { a.Id, a.ActorUsername, a.Action, a.Entity, a.EntityId, a.Metadata, a.CreatedAt })
            .ToListAsync());
}
