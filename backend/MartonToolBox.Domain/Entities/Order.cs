namespace MartonToolBox.Domain.Entities;

public sealed class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Product { get; set; } = "Lifetime";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public string Status { get; set; } = "Pending";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
