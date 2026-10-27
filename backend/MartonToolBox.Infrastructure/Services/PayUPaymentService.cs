using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// PayU Romania via the PayU GPO Europe REST API (v2.1) - the API romania.payu.com points
/// new merchants to (the older secure.payu.ro "API v4" is the legacy Romanian platform).
/// OAuth client-credentials token, server-side "create order" that returns a hosted payment
/// page URL, then status is pulled from PayU on confirm. Pulling means the flow works on
/// localhost too - the notify webhook (which needs a public backend URL) only speeds things
/// up, it isn't required.
///
/// Test mode talks to the sandbox. With PayU:PosId etc. set to your own sandbox POS
/// (register at secure.snd.payu.com with Romania as main market) it charges in RON. With
/// them empty it falls back to PayU's public sandbox POS, which only accepts PLN.
/// </summary>
public sealed class PayUPaymentService(HttpClient http, AppDbContext db, ILicenseService licenses, IConfiguration configuration) : IPaymentService
{
    public const string SandboxBaseUrl = "https://secure.snd.payu.com/";
    private const string PublicPosId = "300746";
    private const string PublicClientSecret = "2ee86a66e5d97e3fadc400c9f19b065d";
    private const string PublicSecondKey = "b6ca15b0d1020e8094d9b5f8d163db54";

    private sealed record TokenResponse([property: JsonPropertyName("access_token")] string AccessToken);

    private sealed record PayUStatus([property: JsonPropertyName("statusCode")] string StatusCode, [property: JsonPropertyName("statusDesc")] string? StatusDesc);

    private sealed record CreateOrderRequest(
        [property: JsonPropertyName("notifyUrl")] string NotifyUrl,
        [property: JsonPropertyName("continueUrl")] string ContinueUrl,
        [property: JsonPropertyName("customerIp")] string CustomerIp,
        [property: JsonPropertyName("merchantPosId")] string MerchantPosId,
        [property: JsonPropertyName("description")] string Description,
        [property: JsonPropertyName("currencyCode")] string CurrencyCode,
        [property: JsonPropertyName("totalAmount")] string TotalAmount,
        [property: JsonPropertyName("extOrderId")] string ExtOrderId,
        [property: JsonPropertyName("buyer")] Buyer Buyer,
        [property: JsonPropertyName("products")] IReadOnlyList<Product> Products);

    private sealed record Buyer([property: JsonPropertyName("language")] string Language);

    private sealed record Product(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("unitPrice")] string UnitPrice,
        [property: JsonPropertyName("quantity")] string Quantity);

    private sealed record CreateOrderResponse(
        [property: JsonPropertyName("status")] PayUStatus Status,
        [property: JsonPropertyName("redirectUri")] string? RedirectUri,
        [property: JsonPropertyName("orderId")] string? OrderId);

    private sealed record GetOrderResponse([property: JsonPropertyName("orders")] IReadOnlyList<PayUOrder>? Orders);

    private sealed record PayUOrder([property: JsonPropertyName("status")] string Status);

    /// <summary>Test mode with no POS of our own configured: use PayU's public PLN sandbox POS.</summary>
    private bool UsePublicPos => configuration.GetValue("PayU:TestMode", true) && string.IsNullOrEmpty(configuration["PayU:PosId"]);
    private string PosId => UsePublicPos ? PublicPosId : configuration["PayU:PosId"] ?? string.Empty;
    private string ClientId => UsePublicPos ? PublicPosId : configuration["PayU:ClientId"] ?? string.Empty;
    private string ClientSecret => UsePublicPos ? PublicClientSecret : configuration["PayU:ClientSecret"] ?? string.Empty;
    public string SecondKey => UsePublicPos ? PublicSecondKey : configuration["PayU:SecondKey"] ?? string.Empty;

    public async Task<CheckoutSession> CreateCheckoutAsync(Guid userId, string product, CancellationToken ct = default)
    {
        var amount = configuration.GetValue<decimal?>("Payments:AmountRon") ?? 10m;
        var currency = UsePublicPos ? "PLN" : configuration["PayU:Currency"] ?? "RON";

        var order = new Order { UserId = userId, Product = product, Amount = amount, Currency = currency, Status = "Pending" };
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);

        var frontendBaseUrl = (configuration["Frontend:BaseUrl"] ?? "http://localhost:4200").TrimEnd('/');
        var name = $"MartonToolBox {product} license";
        // PayU returns the browser with a plain GET, so it can go straight to the Angular app.
        var redirect = await RegisterWithPayUAsync(order, [(name, amount, 1)], name, $"{frontendBaseUrl}/checkout/result?orderId={order.Id}", ct);
        return new CheckoutSession(order.Id, redirect, order.Amount, order.Currency);
    }

    /// <summary>
    /// Starts payment for a shop order the caller has already saved (with its items). Shipping is sent
    /// as its own line so PayU's product lines add up to the order total.
    /// </summary>
    public async Task<CheckoutSession> StartShopCheckoutAsync(Order order, IReadOnlyList<OrderItem> items, CancellationToken ct = default)
    {
        var lines = items.Select(i => (i.Size is null ? i.ProductName : $"{i.ProductName} ({i.Size})", i.UnitPrice, i.Quantity)).ToList();
        if (order.ShippingCost > 0) lines.Add(("Shipping", order.ShippingCost, 1));
        var frontendBaseUrl = (configuration["Frontend:BaseUrl"] ?? "http://localhost:4200").TrimEnd('/');
        var redirect = await RegisterWithPayUAsync(order, lines, $"MartonToolBox shop order {order.Id.ToString("N")[..8].ToUpperInvariant()}", $"{frontendBaseUrl}/shop/orders/{order.Id}", ct);
        return new CheckoutSession(order.Id, redirect, order.Amount, order.Currency);
    }

    private async Task<string> RegisterWithPayUAsync(Order order, IReadOnlyList<(string Name, decimal UnitPrice, int Quantity)> lines, string description, string continueUrl, CancellationToken ct)
    {
        var backendBaseUrl = (configuration["Backend:BaseUrl"] ?? "http://localhost:8080").TrimEnd('/');
        var body = new CreateOrderRequest(
            NotifyUrl: $"{backendBaseUrl}/api/payments/payu/notify",
            ContinueUrl: continueUrl,
            CustomerIp: "127.0.0.1",
            MerchantPosId: PosId,
            Description: description,
            CurrencyCode: order.Currency,
            TotalAmount: MinorUnits(order.Amount),
            ExtOrderId: order.Id.ToString("N"),
            Buyer: new Buyer(configuration["PayU:Language"] ?? "ro"),
            Products: lines.Select(l => new Product(l.Name, MinorUnits(l.UnitPrice), l.Quantity.ToString(CultureInfo.InvariantCulture))).ToList());

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/v2_1/orders") { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new("Bearer", await GetAccessTokenAsync(ct));
        // A successful create answers 302 with the JSON in the body; auto-redirect is off for this client.
        using var response = await http.SendAsync(request, ct);
        var payload = await response.Content.ReadFromJsonAsync<CreateOrderResponse>(cancellationToken: ct);
        if (payload?.Status.StatusCode != "SUCCESS" || string.IsNullOrEmpty(payload.RedirectUri) || string.IsNullOrEmpty(payload.OrderId))
            throw new InvalidOperationException($"PayU rejected the order ({(int)response.StatusCode}): {payload?.Status.StatusCode} {payload?.Status.StatusDesc}");

        db.Payments.Add(new Payment { OrderId = order.Id, Provider = "PayU", ProviderReference = payload.OrderId, Status = "NEW" });
        await db.SaveChangesAsync(ct);
        return payload.RedirectUri;
    }

    private static string MinorUnits(decimal amount) => ((long)Math.Round(amount * 100, MidpointRounding.AwayFromZero)).ToString(CultureInfo.InvariantCulture);

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
        // Final states never change on PayU's side, so skip the round-trip.
        if (order.Status == "Paid") return new OrderConfirmation(OrderState.Completed, false);
        if (order.Status == "Failed") return new OrderConfirmation(OrderState.Failed, false);

        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/v2_1/orders/{Uri.EscapeDataString(payment.ProviderReference)}");
        request.Headers.Authorization = new("Bearer", await GetAccessTokenAsync(ct));
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<GetOrderResponse>(cancellationToken: ct);
        var status = payload?.Orders?.FirstOrDefault()?.Status ?? throw new InvalidOperationException("PayU did not return order status.");

        payment.Status = status;
        var state = status switch
        {
            "COMPLETED" => OrderState.Completed,
            "CANCELED" => OrderState.Failed,
            _ => OrderState.Pending // NEW, PENDING, WAITING_FOR_CONFIRMATION
        };
        order.Status = state switch { OrderState.Completed => "Paid", OrderState.Failed => "Failed", _ => "Pending" };

        var licenseGranted = false;
        if (state == OrderState.Completed && order.Kind == OrderKinds.Shop)
        {
            // Reached once per order: a Paid order returns early above.
            var items = await db.OrderItems.Where(i => i.OrderId == order.Id).ToListAsync(ct);
            var ids = items.Select(i => i.ProductId).ToList();
            var products = await db.ShopProducts.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
            var variantIds = items.Where(i => i.VariantId != null).Select(i => i.VariantId!.Value).ToList();
            var variants = await db.ShopProductVariants.Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
            foreach (var item in items)
            {
                // Sized items draw from their size's stock; others from the product's.
                if (item.VariantId is { } vid && variants.TryGetValue(vid, out var variant)) variant.Stock = Math.Max(0, variant.Stock - item.Quantity);
                else if (products.TryGetValue(item.ProductId, out var product)) product.Stock = Math.Max(0, product.Stock - item.Quantity);
            }
        }
        else if (state == OrderState.Completed)
        {
            licenseGranted = await LicenseGrantor.GrantIfNeededAsync(db, licenses, order, ct);
        }
        await db.SaveChangesAsync(ct);

        return new OrderConfirmation(state, licenseGranted);
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken ct)
    {
        using var response = await http.PostAsync("pl/standard/user/oauth/authorize", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = ClientId,
            ["client_secret"] = ClientSecret
        }), ct);
        if (response.StatusCode != HttpStatusCode.OK) throw new InvalidOperationException($"PayU OAuth failed ({(int)response.StatusCode}). Check PayU:ClientId/ClientSecret.");
        var token = await response.Content.ReadFromJsonAsync<TokenResponse>(cancellationToken: ct);
        return token?.AccessToken ?? throw new InvalidOperationException("PayU OAuth returned no access token.");
    }
}
