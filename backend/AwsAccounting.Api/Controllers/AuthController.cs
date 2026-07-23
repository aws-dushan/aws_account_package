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
[Route("api/auth")]
public class AuthController(AppDbContext db, UserManager<ApplicationUser> users, JwtTokenService jwt, CurrentUser me, AuditService audit) : ControllerBase
{
    public record LoginRequest(string Username, string Password);

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await users.FindByNameAsync(req.Username ?? "");
        if (user is null || !user.IsActive || !await users.CheckPasswordAsync(user, req.Password ?? ""))
            return Unauthorized(new { error = "Incorrect username or password." });

        return Ok(new
        {
            token = jwt.Create(user),
            user = new
            {
                id = user.Id,
                username = user.UserName,
                name = user.DisplayName,
                isAdmin = user.IsAdmin,
                isSuperAdmin = user.IsSuperAdmin,
                mustChangePassword = user.MustChangePassword,
                tenantId = user.TenantId,
            },
        });
    }

    public record ChangePasswordReq(string CurrentPassword, string NewPassword);

    /// <summary>Self-service: a signed-in user changes their own password (also clears the
    /// forced-change flag). Returns a fresh token so the <c>mustChangePassword</c> claim updates.</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordReq req)
    {
        if (me.Id is not Guid uid) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8)
            return BadRequest(new { error = "New password must be at least 8 characters." });
        if (req.CurrentPassword == req.NewPassword)
            return BadRequest(new { error = "The new password must be different from the current one." });

        var user = await users.FindByIdAsync(uid.ToString());
        if (user is null) return Unauthorized();

        var res = await users.ChangePasswordAsync(user, req.CurrentPassword ?? "", req.NewPassword);
        if (!res.Succeeded)
        {
            var msg = res.Errors.Any(e => e.Code == "PasswordMismatch")
                ? "Your current password is incorrect."
                : string.Join("; ", res.Errors.Select(e => e.Description));
            return BadRequest(new { error = msg });
        }

        user.MustChangePassword = false;
        await users.UpdateAsync(user);
        await audit.WriteAsync("user.change_password", "user", user.Id.ToString(), user.TenantId);

        return Ok(new { ok = true, token = jwt.Create(user) });
    }

    /// <summary>The current user with their tenant slug and granted permission keys (for UI gating).</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        if (me.Id is not Guid uid) return Unauthorized();
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == uid);
        if (u is null || !u.IsActive) return Unauthorized();

        string? slug = u.TenantId is Guid t
            ? await db.Tenants.AsNoTracking().Where(x => x.Id == t).Select(x => x.Slug).FirstOrDefaultAsync()
            : null;

        // Admins/super-admins implicitly hold everything; company users get their ticked keys.
        var permissions = u.IsAdmin
            ? PermissionCatalog.AllKeys.ToList()
            : await db.UserPermissions.AsNoTracking().Where(p => p.UserId == uid).Select(p => p.PermissionKey).ToListAsync();

        return Ok(new
        {
            id = u.Id,
            username = u.UserName,
            name = u.DisplayName,
            isAdmin = u.IsAdmin,
            isSuperAdmin = u.IsSuperAdmin,
            mustChangePassword = u.MustChangePassword,
            tenantId = u.TenantId,
            tenantSlug = slug,
            permissions,
        });
    }
}
