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
    public DbSet<ShopProduct> ShopProducts => Set<ShopProduct>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<ShopProductVariant> ShopProductVariants => Set<ShopProductVariant>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<AppUser>(b =>
        {
            b.Property(x => x.DisplayName).HasMaxLength(120);
            b.HasIndex(x => x.Email).IsUnique();
            b.Property(x => x.Address).HasMaxLength(250);
            b.Property(x => x.City).HasMaxLength(80);
            b.Property(x => x.County).HasMaxLength(80);
            b.Property(x => x.PostalCode).HasMaxLength(12);
            b.Property(x => x.CompanyName).HasMaxLength(160);
            b.Property(x => x.TaxId).HasMaxLength(20);
        });
        builder.Entity<Tool>(b => { b.HasIndex(x => x.Slug).IsUnique(); b.Property(x => x.Slug).HasMaxLength(80); });
        builder.Entity<License>(b => { b.HasIndex(x => x.LicenseKey).IsUnique(); b.HasIndex(x => new { x.UserId, x.Status }); });
        builder.Entity<ToolUsage>(b => b.HasIndex(x => new { x.ToolSlug, x.CreatedAt }));
        builder.Entity<Order>(b =>
        {
            b.Property(x => x.Amount).HasPrecision(12, 2);
            b.Property(x => x.ShippingCost).HasPrecision(12, 2);
            b.Property(x => x.Kind).HasMaxLength(20).HasDefaultValue(OrderKinds.License);
            b.HasIndex(x => new { x.Kind, x.CreatedAt });
        });
        builder.Entity<ShopProduct>(b =>
        {
            b.HasIndex(x => x.Slug).IsUnique();
            b.Property(x => x.Slug).HasMaxLength(80);
            b.Property(x => x.Name).HasMaxLength(120);
            b.Property(x => x.Description).HasMaxLength(1000);
            b.Property(x => x.Price).HasPrecision(12, 2);
        });
        builder.Entity<OrderItem>(b =>
        {
            b.HasIndex(x => x.OrderId);
            b.Property(x => x.UnitPrice).HasPrecision(12, 2);
            b.Property(x => x.ProductName).HasMaxLength(120);
            b.Property(x => x.Size).HasMaxLength(20);
        });
        builder.Entity<ShopProductVariant>(b =>
        {
            b.HasIndex(x => new { x.ProductId, x.Size }).IsUnique();
            b.Property(x => x.Size).HasMaxLength(20);
        });
    }
}
