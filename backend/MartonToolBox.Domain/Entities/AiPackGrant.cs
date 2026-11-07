namespace MartonToolBox.Domain.Entities;

/// <summary>
/// A bought AI pack: a higher daily token allowance for a number of days. Created with its order at checkout, so the
/// terms the buyer saw are kept even if the pack's settings change later. Activated (StartsAt/ExpiresAt set) once paid.
/// </summary>
public sealed class AiPackGrant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid OrderId { get; set; }
    public string Pack { get; set; } = string.Empty;
    public string PackName { get; set; } = string.Empty;
    public int DailyTokens { get; set; }
    public int Days { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
}
