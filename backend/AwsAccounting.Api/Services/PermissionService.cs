using AwsAccounting.Api.Auth;
using AwsAccounting.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Services;

/// <summary>
/// User-based (not role-based) authorisation. Admins/super-admins bypass; every other
/// user must have the specific permission key ticked. Permissions are cached per request.
/// </summary>
public sealed class PermissionService(CurrentUser current, AppDbContext db)
{
    private HashSet<string>? _cache;

    public async Task<bool> CanAsync(string permissionKey, CancellationToken ct = default)
    {
        if (current.IsAdmin || current.IsSuperAdmin) return true;
        if (current.Id is not Guid uid) return false;

        _cache ??= (await db.UserPermissions
            .Where(p => p.UserId == uid)
            .Select(p => p.PermissionKey)
            .ToListAsync(ct)).ToHashSet();

        return _cache.Contains(permissionKey);
    }

    public async Task EnsureAsync(string permissionKey, CancellationToken ct = default)
    {
        if (!await CanAsync(permissionKey, ct))
            throw new ForbiddenException(permissionKey);
    }
}

/// <summary>Thrown when the current user lacks a required permission; mapped to 403 by controllers.</summary>
public sealed class ForbiddenException(string permissionKey)
    : Exception($"Missing permission: {permissionKey}")
{
    public string PermissionKey { get; } = permissionKey;
}
