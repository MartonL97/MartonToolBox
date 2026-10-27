using System.Net.Http.Json;
using System.Text.Json.Serialization;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace MartonToolBox.Infrastructure.Services;

public sealed class RevolutPaymentService(HttpClient http, AppDbContext db, ILicenseService licenses, IConfiguration configuration) : IPaymentService
{
    private sealed record CreateOrderRequest(
        [property: JsonPropertyName("amount")] int Amount,
        [property: JsonPropertyName("currency")] string Currency,
        [property: JsonPropertyName("capture_mode")] string CaptureMode,
        [property: JsonPropertyName("merchant_order_data")] MerchantOrderData MerchantOrderData,
        [property: JsonPropertyName("redirect_url")] string RedirectUrl);

    private sealed record MerchantOrderData([property: JsonPropertyName("reference")] string Reference);

    private sealed record RevolutOrderResponse(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("state")] string State,
        [property: JsonPropertyName("checkout_url")] string? CheckoutUrl);

    public async Task<CheckoutSession> CreateCheckoutAsync(Guid userId, string product, CancellationToken ct = default)
    {
        var amount = configuration.GetValue<decimal?>("Payments:AmountRon") ?? 10m;
        var order = new Order { UserId = userId, Product = product, Amount = amount, Currency = "RON", Status = "Pending" };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var frontendBaseUrl = (configuration["Frontend:BaseUrl"] ?? "http://localhost:4200").TrimEnd('/');
        var request = new CreateOrderRequest(
            Amount: (int)Math.Round(amount * 100, MidpointRounding.AwayFromZero),
            Currency: "RON",
            CaptureMode: "automatic",
            MerchantOrderData: new MerchantOrderData(order.Id.ToString()),
            RedirectUrl: $"{frontendBaseUrl}/checkout/result?orderId={order.Id}");

        using var response = await http.PostAsJsonAsync("api/orders", request, ct);
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<RevolutOrderResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Revolut did not return an order.");
        if (string.IsNullOrEmpty(payload.CheckoutUrl)) throw new InvalidOperationException("Revolut order response did not include a checkout URL.");

        db.Payments.Add(new Payment { OrderId = order.Id, Provider = "Revolut", ProviderReference = payload.Id, Status = payload.State });
        await db.SaveChangesAsync(ct);

        return new CheckoutSession(order.Id, payload.CheckoutUrl, order.Amount, order.Currency);
    }

    public async Task<OrderConfirmation> ConfirmOrderAsync(Guid orderId, CancellationToken ct = default)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct) ?? throw new KeyNotFoundException("Order not found.");
        var payment = await db.Payments.FirstOrDefaultAsync(p => p.OrderId == orderId, ct) ?? throw new KeyNotFoundException("Payment not found for order.");
        return await SyncAsync(order, payment, ct);
    }

    public async Task<OrderConfirmation?> ConfirmOrderByProviderReferenceAsync(string providerReference, CancellationToken ct = default)
    {
        var payment = await db.Payments.FirstOrDefaultAsync(p => p.ProviderReference == providerReference, ct);
        if (payment is null) return null;
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == payment.OrderId, ct);
        return order is null ? null : await SyncAsync(order, payment, ct);
    }

    private async Task<OrderConfirmation> SyncAsync(Order order, Payment payment, CancellationToken ct)
    {
        using var response = await http.GetAsync($"api/orders/{payment.ProviderReference}", ct);
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<RevolutOrderResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Revolut did not return order status.");

        payment.Status = payload.State;
        var isCompleted = string.Equals(payload.State, "completed", StringComparison.OrdinalIgnoreCase);
        order.Status = isCompleted ? "Paid" : payload.State;

        var licenseGranted = isCompleted && await LicenseGrantor.GrantIfNeededAsync(db, licenses, order, ct);
        await db.SaveChangesAsync(ct);

        return new OrderConfirmation(isCompleted ? OrderState.Completed : OrderState.Pending, licenseGranted);
    }
}
