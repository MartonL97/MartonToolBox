using MartonToolBox.Application.Licensing;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Infrastructure.Services;

public sealed class FakePaymentService(AppDbContext db, ILicenseService licenses) : IPaymentService
{
    public async Task<CheckoutSession> CreateCheckoutAsync(Guid userId, string product, CancellationToken ct = default)
    {
        var order = new Order { UserId = userId, Product = product, Amount = 10m, Currency = "RON", Status = "Pending" };
        db.Orders.Add(order);
        db.Payments.Add(new Payment { OrderId = order.Id, Provider = "Fake", ProviderReference = $"fake-{order.Id}", Status = "pending" });
        await db.SaveChangesAsync(ct);
        return new CheckoutSession(order.Id, $"fake-checkout://{product}/{order.Id}", order.Amount, order.Currency);
    }

    public async Task<OrderConfirmation> ConfirmOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct) ?? throw new KeyNotFoundException("Order not found.");
        return await CompleteAsync(order, ct);
    }

    public async Task<OrderConfirmation?> ConfirmOrderByProviderReferenceAsync(string providerReference, CancellationToken ct = default)
    {
        var payment = await db.Payments.FirstOrDefaultAsync(p => p.ProviderReference == providerReference, ct);
        if (payment is null) return null;
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == payment.OrderId, ct);
        return order is null ? null : await CompleteAsync(order, ct);
    }

    private async Task<OrderConfirmation> CompleteAsync(Order order, CancellationToken ct)
    {
        order.Status = "Paid";
        var granted = await LicenseGrantor.GrantIfNeededAsync(db, licenses, order, ct);
        await db.SaveChangesAsync(ct);
        return new OrderConfirmation(OrderState.Completed, granted);
    }
}
