using System.Text.Json;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Reconciliation;

public record ResolvedMapping(ColumnMapping Mapping, string Source);

/// <summary>Identifies a column mapping via the configured AI when auto-detect leaves gaps. P3 wires a live provider; until then it declines.</summary>
public interface IAiMappingIdentifier
{
    Task<ColumnMapping?> IdentifyAsync(IReadOnlyList<string[]> rows, ColumnMapping auto, CancellationToken ct);
}

/// <summary>No-op AI identifier used until the AI layer (P3) is wired in.</summary>
public sealed class NullAiMappingIdentifier : IAiMappingIdentifier
{
    public Task<ColumnMapping?> IdentifyAsync(IReadOnlyList<string[]> rows, ColumnMapping auto, CancellationToken ct)
        => Task.FromResult<ColumnMapping?>(null);
}

/// <summary>
/// Resolves a column mapping without asking the user:
///   1. reuse a learned mapping for this exact header layout (per tenant), else
///   2. auto-detect (store it if complete), else
///   3. ask the configured AI to identify the mapping (store it), else
///   4. return the best-effort auto mapping (the run surfaces any gaps).
/// A tenant can have many learned mappings — one per distinct format fingerprint.
/// </summary>
public sealed class MappingResolver(AppDbContext db, IAiMappingIdentifier ai, ILogger<MappingResolver> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<ResolvedMapping> ResolveAsync(Guid tenantId, IReadOnlyList<string[]> rows, string side, CancellationToken ct = default)
    {
        var fp = Mapper.Fingerprint(rows);

        var learned = await db.LedgerMappings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Fingerprint == fp, ct);
        if (learned != null)
        {
            var m = JsonSerializer.Deserialize<ColumnMapping>(learned.Mapping, Json) ?? Mapper.AutoDetect(rows);
            // header row can vary between files of the same format — recompute it, keep the learned columns.
            m.HeaderRow = Mapper.DetectHeaderRow(rows);
            return new ResolvedMapping(m, "learned");
        }

        var auto = Mapper.AutoDetect(rows);
        if (Mapper.Gaps(auto).Count == 0)
        {
            await StoreAsync(tenantId, fp, side, auto, "auto", ct);
            return new ResolvedMapping(auto, "auto");
        }

        try
        {
            var aiMap = await ai.IdentifyAsync(rows, auto, ct);
            if (aiMap != null && Mapper.Gaps(aiMap).Count == 0)
            {
                await StoreAsync(tenantId, fp, side, aiMap, "ai", ct);
                return new ResolvedMapping(aiMap, "ai");
            }
        }
        catch (Exception e)
        {
            log.LogWarning(e, "AI mapping identification failed for tenant {TenantId}", tenantId);
        }

        return new ResolvedMapping(auto, "auto-partial");
    }

    private async Task StoreAsync(Guid tenantId, string fp, string side, ColumnMapping mapping, string source, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(mapping, Json);
        var existing = await db.LedgerMappings.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Fingerprint == fp, ct);
        if (existing == null)
        {
            db.LedgerMappings.Add(new LedgerMapping { TenantId = tenantId, Fingerprint = fp, Side = side, Mapping = json, Source = source });
        }
        else
        {
            existing.Mapping = json;
            existing.Source = source;
            existing.UpdatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
    }
}
