using System.Security.Claims;

namespace AwsAccounting.Api.Auth;

/// <summary>Reads the authenticated user from the JWT claims.</summary>
public class CurrentUser(IHttpContextAccessor http)
{
    private ClaimsPrincipal? U => http.HttpContext?.User;

    public Guid? Id =>
        Guid.TryParse(U?.FindFirstValue(ClaimTypes.NameIdentifier) ?? U?.FindFirstValue("sub"), out var g) ? g : null;

    public string? Username => U?.FindFirstValue("username");
    public bool IsAdmin => U?.FindFirstValue("isAdmin") == "true";
    public bool IsSuperAdmin => U?.FindFirstValue("isSuperAdmin") == "true";
    public Guid? TenantId => Guid.TryParse(U?.FindFirstValue("tenantId"), out var g) ? g : null;
}
