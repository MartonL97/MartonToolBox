namespace MartonToolBox.Domain.Entities;

/// <summary>A user's profile picture. Kept in its own table so the image isn't loaded every time the user is.</summary>
public sealed class UserAvatar
{
    public Guid UserId { get; set; }
    public byte[] Data { get; set; } = [];
    public string ContentType { get; set; } = string.Empty;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
