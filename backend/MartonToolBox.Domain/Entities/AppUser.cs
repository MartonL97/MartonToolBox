using Microsoft.AspNetCore.Identity;

namespace MartonToolBox.Domain.Entities;

public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsActive { get; set; } = true;

    // Optional profile, filled in by the user from the account page (phone uses IdentityUser.PhoneNumber).
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? County { get; set; }
    public string? PostalCode { get; set; }
    public string? CompanyName { get; set; }
    public string? TaxId { get; set; }
    public ICollection<License> Licenses { get; set; } = new List<License>();
}
