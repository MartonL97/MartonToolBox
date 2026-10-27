using System.Text.Json;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/payments"), Authorize]
public sealed class PaymentsController(
    IPaymentService payments,
    ILicenseService licenses,
    UserManager<AppUser> users,
    IConfiguration configuration,
    ILogger<PaymentsController> logger) : ControllerBase
{
    [HttpPost("checkout")]
    public async Task<ActionResult<ApiResponse<CheckoutSession>>> Checkout(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (await licenses.HasAccessAsync(user.Id, ct)) return BadRequest(new { error = "You already have an active license." });

        var session = await payments.CreateCheckoutAsync(user.Id, "Lifetime", ct);
        return Ok(new ApiResponse<CheckoutSession>(session));
    }

    [HttpPost("checkout/{orderId:guid}/confirm")]
    public async Task<ActionResult<ApiResponse<OrderConfirmation>>> Confirm(Guid orderId, CancellationToken ct)
    {
        var confirmation = await payments.ConfirmOrderAsync(orderId, ct);
        return Ok(new ApiResponse<OrderConfirmation>(confirmation));
    }

    [HttpPost("webhook"), AllowAnonymous]
    public async Task<IActionResult> Webhook(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var rawBody = await reader.ReadToEndAsync(ct);

        var signingSecret = configuration["Revolut:WebhookSigningSecret"] ?? string.Empty;
        var signature = Request.Headers["Revolut-Signature"].ToString();
        var timestamp = Request.Headers["Revolut-Request-Timestamp"].ToString();

        if (!RevolutWebhookVerifier.Verify(signature, timestamp, rawBody, signingSecret))
        {
            logger.LogWarning("Rejected a Revolut webhook with an invalid or missing signature.");
            return Unauthorized();
        }

        var orderReference = TryExtractOrderId(rawBody);
        if (orderReference is not null) await payments.ConfirmOrderByProviderReferenceAsync(orderReference, ct);
        else logger.LogWarning("Could not find an order id in a verified Revolut webhook payload.");

        return Ok();
    }

    private static string? TryExtractOrderId(string rawBody)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawBody);
            var root = doc.RootElement;
            if (root.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String) return id.GetString();
            if (root.TryGetProperty("order_id", out var orderId) && orderId.ValueKind == JsonValueKind.String) return orderId.GetString();
            if (root.TryGetProperty("order", out var order) && order.TryGetProperty("id", out var nestedId) && nestedId.ValueKind == JsonValueKind.String) return nestedId.GetString();
            if (root.TryGetProperty("data", out var data) && data.TryGetProperty("id", out var dataId) && dataId.ValueKind == JsonValueKind.String) return dataId.GetString();
        }
        catch (JsonException)
        {
        }
        return null;
    }
}
