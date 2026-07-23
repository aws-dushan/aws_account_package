using AwsAccounting.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<AiSetting> AiSettings => Set<AiSetting>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<FileRecord> Files => Set<FileRecord>();
    public DbSet<ReconciliationRun> Runs => Set<ReconciliationRun>();
    public DbSet<LedgerLine> LedgerLines => Set<LedgerLine>();
    public DbSet<MatchEntity> Matches => Set<MatchEntity>();
    public DbSet<MatchLine> MatchLines => Set<MatchLine>();
    public DbSet<ExceptionRow> Exceptions => Set<ExceptionRow>();
    public DbSet<LedgerMapping> LedgerMappings => Set<LedgerMapping>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Tenant>(e => e.HasIndex(x => x.Slug).IsUnique());
        b.Entity<UserPermission>(e =>
        {
            e.HasKey(x => new { x.UserId, x.PermissionKey });
            e.HasIndex(x => x.UserId);
        });
        b.Entity<AiSetting>(e => e.HasIndex(x => x.Purpose).IsUnique());
        b.Entity<AuditEntry>(e =>
        {
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => x.TenantId);
        });
        b.Entity<ApplicationUser>(e => e.HasIndex(x => x.TenantId));

        b.Entity<MatchLine>(e => e.HasKey(x => new { x.MatchId, x.LedgerLineId }));
        b.Entity<LedgerLine>(e =>
        {
            e.HasIndex(x => x.RunId);
            e.Property(x => x.Debit).HasPrecision(16, 2);
            e.Property(x => x.Credit).HasPrecision(16, 2);
            e.Property(x => x.Amount).HasPrecision(16, 2);
        });
        b.Entity<MatchEntity>(e => { e.HasIndex(x => x.RunId); e.Property(x => x.Confidence).HasPrecision(4, 3); });
        b.Entity<ExceptionRow>(e => { e.HasIndex(x => x.RunId); e.Property(x => x.Amount).HasPrecision(16, 2); });
        b.Entity<ReconciliationRun>(e =>
        {
            e.HasIndex(x => x.TenantId);
            e.Property(x => x.AutoMatchPct).HasPrecision(5, 2);
            e.Property(x => x.MatchedValue).HasPrecision(16, 2);
        });
        b.Entity<AiSetting>(e => e.Property(x => x.Temperature).HasPrecision(3, 2));
        b.Entity<LedgerMapping>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.Fingerprint }).IsUnique();
            e.Property(x => x.Mapping).HasColumnType("jsonb");
        });
    }
}
