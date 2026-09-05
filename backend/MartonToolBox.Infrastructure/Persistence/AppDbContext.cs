using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser, Microsoft.AspNetCore.Identity.IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Tool> Tools => Set<Tool>();
    public DbSet<License> Licenses => Set<License>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<ToolUsage> ToolUsages => Set<ToolUsage>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<AppUser>(b => { b.Property(x => x.DisplayName).HasMaxLength(120); b.HasIndex(x => x.Email).IsUnique(); });
        builder.Entity<Tool>(b => { b.HasIndex(x => x.Slug).IsUnique(); b.Property(x => x.Slug).HasMaxLength(80); });
        builder.Entity<License>(b => { b.HasIndex(x => x.LicenseKey).IsUnique(); b.HasIndex(x => new { x.UserId, x.Status }); });
        builder.Entity<ToolUsage>(b => b.HasIndex(x => new { x.ToolSlug, x.CreatedAt }));
        builder.Entity<Order>(b => b.Property(x => x.Amount).HasPrecision(12, 2));
    }
}
