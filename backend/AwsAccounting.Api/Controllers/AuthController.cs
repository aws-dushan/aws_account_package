using System.Security.Claims;
using AwsAccounting.Api.Auth;
using AwsAccounting.Api.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(UserManager<ApplicationUser> users, JwtTokenService jwt) : ControllerBase
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
