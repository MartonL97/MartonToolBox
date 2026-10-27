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

    /// <summary>"License" (unlocks the tools) or "Shop" (physical goods). Only license orders grant a license.</summary>
    public string Kind { get; set; } = OrderKinds.License;

    // Shop orders only.
    public decimal ShippingCost { get; set; }
    public string? ShippingName { get; set; }
    public string? ShippingPhone { get; set; }
    public string? ShippingAddress { get; set; }
    public string? ShippingCity { get; set; }
    public string? ShippingCounty { get; set; }
    public string? ShippingPostalCode { get; set; }
    public DateTimeOffset? ShippedAt { get; set; }
}

public static class OrderKinds
{
    public const string License = "License";
    public const string Shop = "Shop";
}
