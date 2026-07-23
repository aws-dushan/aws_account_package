using Microsoft.AspNetCore.Identity;

namespace AwsAccounting.Api.Domain;

/// <summary>A company (tenant). Users and data are isolated per tenant.</summary>
public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Platform user (ASP.NET Identity). A NULL TenantId = platform super-admin (ERP team)
/// who spans all companies. Admin-provisioned; username-based (no email required).
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public Guid? TenantId { get; set; }
    public Tenant? Tenant { get; set; }
    public string DisplayName { get; set; } = "";
    public bool IsAdmin { get; set; }
    public bool IsActive { get; set; } = true;
    public bool MustChangePassword { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Platform super-admin = admin with no tenant.</summary>
    public bool IsSuperAdmin => IsAdmin && TenantId is null;
}

/// <summary>One granted capability key per user (e.g. "ar-reconciliation.run.create").</summary>
public class UserPermission
{
    public Guid UserId { get; set; }
    public string PermissionKey { get; set; } = "";
}

/// <summary>AI provider config per purpose ("reasoning" | "vision"). Key stored encrypted.</summary>
public class AiSetting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Purpose { get; set; } = "";      // reasoning | vision
    public string Provider { get; set; } = "";     // google | anthropic | openai | azure
    public string Model { get; set; } = "";
    public string? ApiKeyEnc { get; set; }         // AES-256-GCM ciphertext (base64)
    public string? BaseUrl { get; set; }
    public decimal? Temperature { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Append-only audit trail (no FK to users so records survive deletion).</summary>
public class AuditEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ActorUserId { get; set; }
    public string? ActorUsername { get; set; }
    public string Action { get; set; } = "";
    public string? Entity { get; set; }
    public string? EntityId { get; set; }
    public Guid? TenantId { get; set; }
    public string? Metadata { get; set; }          // JSON string
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
