namespace MartonToolBox.Application.Shipping;

/// <summary>Delivery steps a courier can report, in order.</summary>
public enum CourierStage { Registered, Shipped, AtDepot, OutForDelivery, Delivered }

/// <summary>One courier status. Stage is null for statuses that don't move the order forward, such as returns.</summary>
public sealed record CourierEvent(string Status, CourierStage? Stage, DateTimeOffset At);

public interface ICourierTracking
{
    /// <summary>The AWB's statuses, oldest first, or null when the courier can't be reached or doesn't know the AWB.</summary>
    Task<IReadOnlyList<CourierEvent>?> GetEventsAsync(string awb, CancellationToken cancellationToken = default);
}
