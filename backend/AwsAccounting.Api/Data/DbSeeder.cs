using AwsAccounting.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider sp)
    {
        var db = sp.GetRequiredService<AppDbContext>();
        var users = sp.GetRequiredService<UserManager<ApplicationUser>>();

        if (!await db.Tenants.AnyAsync(t => t.Slug == "aws-distribution"))
        {
            db.Tenants.Add(new Tenant { Name = "AWS Distribution", Slug = "aws-distribution" });
            await db.SaveChangesAsync();
        }

        if (await users.FindByNameAsync("Dev_Admin") is null)
        {
            var admin = new ApplicationUser
            {
                UserName = "Dev_Admin",
                DisplayName = "Dev Admin",
                IsAdmin = true,       // platform super-admin (no tenant)
                IsActive = true,
                MustChangePassword = false,
                TenantId = null,
            };
            var res = await users.CreateAsync(admin, "Admin@12345");
            if (!res.Succeeded)
                Console.WriteLine("Seed admin failed: " + string.Join("; ", res.Errors.Select(e => e.Description)));
        }
    }
}
