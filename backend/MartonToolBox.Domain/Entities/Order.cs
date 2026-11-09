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

    /// <summary>"License" (unlocks the tools), "Shop" (physical goods) or "AiPack" (more AI messages per day). Only license orders grant a license.</summary>
    public string Kind { get; set; } = OrderKinds.License;

    // Shop orders only.
    public decimal ShippingCost { get; set; }
    public string? ShippingName { get; set; }
    public string? ShippingPhone { get; set; }
    public string? ShippingAddress { get; set; }
    public string? ShippingCity { get; set; }
    public string? ShippingCounty { get; set; }
    public string? ShippingPostalCode { get; set; }
    // Delivery timeline, in order. An admin moves a paid order through these one step at a time.
    public DateTimeOffset? PaidAt { get; set; }
    public DateTimeOffset? PreparedAt { get; set; }
    /// <summary>When the AWB was registered: Sameday's date, or when an admin saved it.</summary>
    public DateTimeOffset? RegisteredAt { get; set; }
    public DateTimeOffset? ShippedAt { get; set; }
    public DateTimeOffset? AtCourierDepotAt { get; set; }
    public DateTimeOffset? OutForDeliveryAt { get; set; }
    /// <summary>When the customer received the order. The order is finished from then on.</summary>
    public DateTimeOffset? DeliveredAt { get; set; }
    /// <summary>The courier's AWB, set by an admin and shown to the buyer.</summary>
    public string? TrackingNumber { get; set; }
    /// <summary>When the courier was last asked about this AWB.</summary>
    public DateTimeOffset? TrackingCheckedAt { get; set; }
}

public static class OrderKinds
{
    public const string License = "License";
    public const string Shop = "Shop";
    public const string AiPack = "AiPack";
}

/// <summary>
/// Order.Status values besides "Pending", "Paid" and "Failed". A buyer can ask to cancel an unpaid shop order
/// (CancelRequested); an admin then cancels it (Cancelled), which hides it from the buyer's order list.
/// </summary>
public static class OrderStatuses
{
    public const string CancelRequested = "CancelRequested";
    public const string Cancelled = "Cancelled";
}
