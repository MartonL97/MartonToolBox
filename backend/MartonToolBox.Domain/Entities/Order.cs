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
    /// <summary>The Sameday easybox the buyer chose (its Sameday locker id); null for delivery to the address. The Shipping* address fields then hold the locker's address.</summary>
    public int? LockerId { get; set; }
    /// <summary>"Card" (paid online through PayU before shipping) or "CashOnDelivery" (paid to the courier; address delivery only).</summary>
    public string PaymentMethod { get; set; } = PaymentMethods.Card;
    public string? LockerName { get; set; }
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

public static class PaymentMethods
{
    public const string Card = "Card";
    public const string CashOnDelivery = "CashOnDelivery";
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
/// Pay-on-delivery orders start as CashOnDelivery.
/// </summary>
public static class OrderStatuses
{
    public const string CancelRequested = "CancelRequested";
    public const string Cancelled = "Cancelled";
    /// <summary>A pay-on-delivery order: confirmed and shipped like a paid one; it becomes "Paid" when delivered (the courier collects the money).</summary>
    public const string CashOnDelivery = "CashOnDelivery";

    /// <summary>Orders that go through delivery: paid online, or confirmed to be paid on delivery.</summary>
    public static bool Ships(string status) => status is "Paid" or CashOnDelivery;

    /// <summary>Once a pay-on-delivery order is delivered the courier has the money, so it counts as paid from then on.</summary>
    public static void SettleIfDelivered(Order order)
    {
        if (order.Status != CashOnDelivery || order.DeliveredAt is not { } at) return;
        order.Status = "Paid";
        order.PaidAt ??= at;
    }
}
