using System.Text.Json;
using AwsAccounting.Api.Auth;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;

namespace AwsAccounting.Api.Services;

public class AuditService(AppDbContext db, CurrentUser me)
{
    public async Task WriteAsync(string action, string? entity = null, string? entityId = null, Guid? tenantId = null, object? metadata = null)
    {
        db.AuditEntries.Add(new AuditEntry
        {
            ActorUserId = me.Id,
            ActorUsername = me.Username,
            Action = action,
            Entity = entity,
            EntityId = entityId,
            TenantId = tenantId,
            Metadata = metadata is null ? null : JsonSerializer.Serialize(metadata),
        });
        await db.SaveChangesAsync();
    }
}
