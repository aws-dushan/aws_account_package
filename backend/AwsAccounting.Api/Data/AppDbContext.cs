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
    }
}
