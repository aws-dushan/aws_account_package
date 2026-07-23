using System.Security.Claims;
using AwsAccounting.Api.Auth;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(UserManager<ApplicationUser> users, JwtTokenService jwt, CurrentUser me, AuditService audit) : ControllerBase
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

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me() => Ok(new
    {
        id = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub"),
        username = User.FindFirstValue("username"),
        name = User.FindFirstValue("name"),
        isAdmin = User.FindFirstValue("isAdmin") == "true",
        isSuperAdmin = User.FindFirstValue("isSuperAdmin") == "true",
        tenantId = User.FindFirstValue("tenantId"),
    });
}
