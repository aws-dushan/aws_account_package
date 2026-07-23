using System.Text.RegularExpressions;
using AwsAccounting.Api.Auth;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Modules;
using AwsAccounting.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Policy = "SuperAdmin")]
public class UsersController(AppDbContext db, UserManager<ApplicationUser> users, CurrentUser me, AuditService audit) : ControllerBase
{
    private const string Platform = "__platform__";

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var rows = await (from u in db.Users
                          join t in db.Tenants on u.TenantId equals t.Id into tj
                          from t in tj.DefaultIfEmpty()
                          orderby u.CreatedAt descending
                          select new { u.Id, Username = u.UserName, u.DisplayName, u.IsAdmin, u.IsActive, TenantName = t != null ? t.Name : null })
            .ToListAsync();
        return Ok(rows);
    }

    public record CreateReq(string DisplayName, string Username, string Assignment);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReq req)
    {
        var username = (req.Username ?? "").Trim();
        if (!Regex.IsMatch(username, "^[a-zA-Z0-9_.-]{3,64}$")) return BadRequest(new { error = "Username must be 3–64 chars (letters, numbers, _ . -)." });
        if ((req.DisplayName ?? "").Trim().Length < 2) return BadRequest(new { error = "Enter a display name." });
        if (string.IsNullOrEmpty(req.Assignment)) return BadRequest(new { error = "Select a company (or Platform super-admin)." });
        if (await users.FindByNameAsync(username) is not null) return Conflict(new { error = $"Username \"{username}\" is already taken." });

        var isPlatform = req.Assignment == Platform;
        Guid? tenantId = null;
        if (!isPlatform)
        {
            if (!Guid.TryParse(req.Assignment, out var tg)) return BadRequest(new { error = "Invalid company." });
            tenantId = tg;
        }

        var temp = TempPassword();
        var user = new ApplicationUser
        {
            UserName = username,
            DisplayName = req.DisplayName.Trim(),
            TenantId = tenantId,
            IsAdmin = isPlatform,
            IsActive = true,
            MustChangePassword = true,
        };
        var res = await users.CreateAsync(user, temp);
        if (!res.Succeeded) return BadRequest(new { error = string.Join("; ", res.Errors.Select(e => e.Description)) });

        await audit.WriteAsync("user.create", "user", user.Id.ToString(), tenantId, new { username, scope = isPlatform ? "platform-admin" : "company-user" });
        return Ok(new { user.Id, username, tempPassword = temp });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var u = await (from x in db.Users
                       join t in db.Tenants on x.TenantId equals t.Id into tj
                       from t in tj.DefaultIfEmpty()
                       where x.Id == id
                       select new { x.Id, Username = x.UserName, x.DisplayName, x.IsAdmin, x.IsActive, x.MustChangePassword, x.TenantId, TenantName = t != null ? t.Name : null })
            .FirstOrDefaultAsync();
        if (u is null) return NotFound();
        var perms = await db.UserPermissions.Where(p => p.UserId == id).Select(p => p.PermissionKey).ToListAsync();
        return Ok(new { user = u, permissions = perms });
    }

    public record ActiveReq(bool IsActive);

    [HttpPost("{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, [FromBody] ActiveReq req)
    {
        if (me.Id == id) return BadRequest(new { error = "You can't change your own status." });
        var u = await db.Users.FindAsync(id);
        if (u is null) return NotFound();
        u.IsActive = req.IsActive;
        await db.SaveChangesAsync();
        await audit.WriteAsync(req.IsActive ? "user.enable" : "user.disable", "user", id.ToString());
        return Ok(new { u.Id, u.IsActive });
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id)
    {
        var u = await users.FindByIdAsync(id.ToString());
        if (u is null) return NotFound();
        var temp = TempPassword();
        await users.RemovePasswordAsync(u);
        var res = await users.AddPasswordAsync(u, temp);
        if (!res.Succeeded) return BadRequest(new { error = string.Join("; ", res.Errors.Select(e => e.Description)) });
        u.MustChangePassword = true;
        await db.SaveChangesAsync();
        await audit.WriteAsync("user.reset_password", "user", id.ToString());
        return Ok(new { tempPassword = temp });
    }

    public record PermsReq(string[] Keys);

    [HttpPut("{id:guid}/permissions")]
    public async Task<IActionResult> SetPermissions(Guid id, [FromBody] PermsReq req)
    {
        if (await db.Users.FindAsync(id) is null) return NotFound();
        var keys = (req.Keys ?? []).Where(PermissionCatalog.IsValid).Distinct().ToList();
        await db.UserPermissions.Where(p => p.UserId == id).ExecuteDeleteAsync();
        if (keys.Count > 0)
        {
            db.UserPermissions.AddRange(keys.Select(k => new UserPermission { UserId = id, PermissionKey = k }));
            await db.SaveChangesAsync();
        }
        await audit.WriteAsync("user.permissions.set", "user", id.ToString(), null, new { count = keys.Count, keys });
        return Ok(new { ok = true, count = keys.Count });
    }

    private static string TempPassword() => "Aa1!" + Guid.NewGuid().ToString("N")[..8];
}
