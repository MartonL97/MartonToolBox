namespace MartonToolBox.Application.Payments;

public interface IPaymentService
{
    Task<string> CreateCheckoutAsync(Guid userId, string product, CancellationToken cancellationToken = default);
}
