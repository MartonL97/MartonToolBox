namespace MartonToolBox.Application.Payments;

public sealed record CheckoutSession(Guid OrderId, string CheckoutUrl, decimal Amount, string Currency);

public enum OrderState { Pending, Completed, Failed }

public sealed record OrderConfirmation(OrderState State, bool LicenseGranted);

public interface IPaymentService
{
    Task<CheckoutSession> CreateCheckoutAsync(Guid userId, string product, CancellationToken cancellationToken = default);
    Task<OrderConfirmation> ConfirmOrderAsync(Guid orderId, CancellationToken cancellationToken = default);
    Task<OrderConfirmation?> ConfirmOrderByProviderReferenceAsync(string providerReference, CancellationToken cancellationToken = default);
}
