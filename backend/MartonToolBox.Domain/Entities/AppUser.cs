using Microsoft.AspNetCore.Identity;

namespace MartonToolBox.Domain.Entities;

public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsActive { get; set; } = true;
    public ICollection<License> Licenses { get; set; } = new List<License>();
}
