using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AwsAccounting.Api.Domain;
using Microsoft.IdentityModel.Tokens;

namespace AwsAccounting.Api.Auth;

public class JwtTokenService(IConfiguration config)
{
    public string Create(ApplicationUser user)
    {
        var jwt = config.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new("username", user.UserName ?? ""),
            new("name", user.DisplayName),
            new("isAdmin", user.IsAdmin ? "true" : "false"),
            new("isSuperAdmin", user.IsSuperAdmin ? "true" : "false"),
            new("mustChangePassword", user.MustChangePassword ? "true" : "false"),
        };
        if (user.TenantId is Guid tid) claims.Add(new Claim("tenantId", tid.ToString()));

        var token = new JwtSecurityToken(
            issuer: jwt["Issuer"],
            audience: jwt["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
