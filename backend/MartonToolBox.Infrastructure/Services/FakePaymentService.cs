using MartonToolBox.Application.Payments;

namespace MartonToolBox.Infrastructure.Services;

public sealed class FakePaymentService : IPaymentService
{
    public Task<string> CreateCheckoutAsync(Guid userId, string product, CancellationToken cancellationToken = default) => Task.FromResult($"fake-checkout://{product}/{userId}");
}
