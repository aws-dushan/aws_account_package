using System.Security.Cryptography;
using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;

namespace AwsAccounting.Api.Services;

/// <summary>Persists uploaded files to disk (per-tenant folders) and records them in the DB.</summary>
public sealed class FileStorage(AppDbContext db, IConfiguration config, IWebHostEnvironment env)
{
    private string Root => Path.IsPathRooted(config["Storage:Root"] ?? "uploads")
        ? config["Storage:Root"]!
        : Path.Combine(env.ContentRootPath, config["Storage:Root"] ?? "uploads");

    public async Task<FileRecord> SaveAsync(Guid tenantId, string kind, byte[] bytes, string originalName, string? mime, Guid? uploadedBy, CancellationToken ct = default)
    {
        var sha = Convert.ToHexStringLower(SHA256.HashData(bytes));
        var id = Guid.NewGuid();
        var ext = Path.GetExtension(originalName);
        var key = Path.Combine(tenantId.ToString(), $"{id:N}{ext}");
        var full = Path.Combine(Root, key);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await File.WriteAllBytesAsync(full, bytes, ct);

        var rec = new FileRecord
        {
            Id = id,
            TenantId = tenantId,
            Kind = kind,
            OriginalName = originalName,
            Mime = mime,
            SizeBytes = bytes.Length,
            Sha256 = sha,
            StorageKey = key,
            UploadedBy = uploadedBy,
        };
        db.Files.Add(rec);
        await db.SaveChangesAsync(ct);
        return rec;
    }

    public async Task<byte[]> ReadAsync(FileRecord rec, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(rec.StorageKey)) throw new FileNotFoundException("File has no storage key.");
        return await File.ReadAllBytesAsync(Path.Combine(Root, rec.StorageKey), ct);
    }
}
