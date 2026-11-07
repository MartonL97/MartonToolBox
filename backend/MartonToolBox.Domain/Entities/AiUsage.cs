namespace MartonToolBox.Domain.Entities;

/// <summary>One answered AI Assistant message and the tokens it used (prompt + reply). Summed over a rolling 24 hours against the user's daily limit.</summary>
public sealed class AiUsage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public int Tokens { get; set; }
}
