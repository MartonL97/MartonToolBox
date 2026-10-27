using System.Text.Json;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

/// <summary>
/// Separate from PaymentsController since PayU's notification shape and signature are
/// provider-specific and this endpoint must keep working even when PayU isn't the active provider.
/// </summary>
[ApiController, Route("api/payments/payu")]
public sealed class PayUController(PayUPaymentService payu, ILogger<PayUController> logger) : ControllerBase
{
    [HttpPost("notify"), AllowAnonymous]
    public async Task<IActionResult> Notify(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var rawBody = await reader.ReadToEndAsync(ct);

        if (!PayUSignature.Verify(Request.Headers["OpenPayu-Signature"].ToString(), rawBody, payu.SecondKey))
        {
            logger.LogWarning("Rejected a PayU notification with an invalid or missing signature.");
            return Unauthorized();
        }

        var payuOrderId = TryExtractOrderId(rawBody);
        if (payuOrderId is null)
        {
            logger.LogWarning("Could not find an order id in a verified PayU notification.");
            return Ok();
        }

        // The notification's own status is not trusted on its own: re-read it from PayU.
        if (await payu.ConfirmOrderByProviderReferenceAsync(payuOrderId, ct) is null)
            logger.LogWarning("PayU notification for unknown order {PayUOrderId}.", payuOrderId);
        return Ok();
    }

    private static string? TryExtractOrderId(string rawBody)
    {
        try
        {
            using var doc = JsonDocument.Parse(rawBody);
            return doc.RootElement.TryGetProperty("order", out var order) && order.TryGetProperty("orderId", out var id) && id.ValueKind == JsonValueKind.String
                ? id.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
