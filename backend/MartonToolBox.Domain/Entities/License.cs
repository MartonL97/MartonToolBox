namespace MartonToolBox.Domain.Entities;

public enum LicenseStatus { Active, Suspended, Revoked }
public enum LicenseProduct { Lifetime }

public sealed class License
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string LicenseKey { get; set; } = string.Empty;
    public LicenseProduct Product { get; set; } = LicenseProduct.Lifetime;
    public LicenseStatus Status { get; set; } = LicenseStatus.Active;
    public DateTimeOffset PurchasedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ExpiresAt { get; set; }
    public AppUser? User { get; set; }
}
