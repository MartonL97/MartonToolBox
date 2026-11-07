using System.Collections.Concurrent;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Ai;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Controllers;

public sealed record ChatRequestDto(IReadOnlyList<ChatMessage>? Messages);
/// <summary>Users see their allowance only as a percentage; token counts stay on the server.</summary>
public sealed record AiQuotaDto(int PercentUsed, bool LimitReached, string Plan, string PlanName, DateTimeOffset? PlanExpiresAt, DateTimeOffset? NextFreeAt);
/// <summary>TimesBasic: how many times the Basic allowance the pack gives per 24 hours.</summary>
public sealed record AiPackDto(string Id, string Name, int TimesBasic, int Days, decimal Price, string Currency);
public sealed record AiUsageDto(AiQuotaDto Quota, IReadOnlyList<AiPackDto> Packs);
/// <summary>Status is "Paid", "Pending" or "Failed".</summary>
public sealed record AiPackOrderDto(string Status, string PackName, AiQuotaDto Quota);

/// <summary>Chat with the self-hosted model (llama.cpp server in Docker). Licensed users only, like the other tools.</summary>
[ApiController, Route("api/ai"), Authorize]
public sealed class AiController(
    IChatService chat,
    IAiQuotaService quotas,
    ILicenseService licenses,
    AppDbContext db,
    PayUPaymentService payu,
    UserManager<AppUser> users,
    ILogger<AiController> logger) : ControllerBase
{
    public const int MaxMessages = 40;
    public const int MaxMessageChars = 8_000;
    public const int MaxTotalChars = 32_000;

    /// <summary>Users with a reply currently streaming. A local model answers a few requests at a time, so one per user.</summary>
    private static readonly ConcurrentDictionary<Guid, byte> Busy = new();

    [HttpGet("status")]
    public async Task<ActionResult<ApiResponse<ChatStatus>>> Status(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await licenses.HasAccessAsync(user.Id, ct)) return LicenseRequired();
        return Ok(new ApiResponse<ChatStatus>(await chat.GetStatusAsync(ct)));
    }

    /// <summary>How much of today's allowance is used, and the packs that raise it.</summary>
    [HttpGet("usage")]
    public async Task<ActionResult<ApiResponse<AiUsageDto>>> Usage(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await licenses.HasAccessAsync(user.Id, ct)) return LicenseRequired();
        var packs = quotas.Packs.Select(p => new AiPackDto(p.Id, p.Name, Math.Max(1, (int)Math.Round(p.DailyTokens / (double)quotas.BasicDailyTokens)), p.Days, p.Price, p.Currency)).ToList();
        return Ok(new ApiResponse<AiUsageDto>(new AiUsageDto(ToDto(await quotas.GetAsync(user.Id, ct)), packs)));
    }

    /// <summary>Starts a PayU payment for an AI pack. The pack's terms are saved with the order, so later price changes don't affect it.</summary>
    [HttpPost("packs/{packId}/checkout")]
    public async Task<ActionResult<ApiResponse<CheckoutSession>>> BuyPack(string packId, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await licenses.HasAccessAsync(user.Id, ct)) return LicenseRequired();
        var pack = quotas.Packs.FirstOrDefault(p => string.Equals(p.Id, packId, StringComparison.OrdinalIgnoreCase));
        if (pack is null) return NotFound(new { error = "This AI pack doesn't exist." });

        var order = new Order { UserId = user.Id, Kind = OrderKinds.AiPack, Product = pack.Id, Amount = pack.Price, Currency = pack.Currency, Status = "Pending" };
        db.Orders.Add(order);
        db.AiPackGrants.Add(new AiPackGrant { UserId = user.Id, OrderId = order.Id, Pack = pack.Id, PackName = pack.Name, DailyTokens = pack.DailyTokens, Days = pack.Days });
        await db.SaveChangesAsync(ct);
        try
        {
            var description = $"MartonToolBox AI {pack.Name} pack ({pack.Days} days)";
            return Ok(new ApiResponse<CheckoutSession>(await payu.StartAiPackCheckoutAsync(order, description, ct)));
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            logger.LogError(ex, "Could not start PayU payment for AI pack order {OrderId}.", order.Id);
            order.Status = "Failed";
            await db.SaveChangesAsync(ct);
            return StatusCode(502, new { error = "The payment provider is unavailable right now. Please try again in a moment." });
        }
    }

    /// <summary>Asks PayU for the latest status (the AI page polls this after the buyer returns) and activates the pack once paid.</summary>
    [HttpPost("packs/orders/{orderId:guid}/confirm")]
    public async Task<ActionResult<ApiResponse<AiPackOrderDto>>> ConfirmPack(Guid orderId, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.UserId == user.Id && o.Kind == OrderKinds.AiPack, ct);
        if (order is null) return NotFound();
        if (order.Status == "Pending" && await db.Payments.AnyAsync(p => p.OrderId == orderId, ct))
        {
            try { await payu.ConfirmOrderAsync(orderId, ct); }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                // The page polls again; a PayU hiccup shouldn't fail it.
                logger.LogWarning(ex, "Could not check PayU status for AI pack order {OrderId}.", orderId);
            }
        }
        var packName = await db.AiPackGrants.Where(g => g.OrderId == orderId).Select(g => g.PackName).FirstOrDefaultAsync(ct) ?? order.Product;
        var status = order.Status switch { "Paid" => "Paid", "Failed" or OrderStatuses.Cancelled => "Failed", _ => "Pending" };
        return Ok(new ApiResponse<AiPackOrderDto>(new AiPackOrderDto(status, packName, ToDto(await quotas.GetAsync(user.Id, ct)))));
    }

    /// <summary>Streams the reply as plain UTF-8 text, flushed fragment by fragment.</summary>
    [HttpPost("chat"), RequestSizeLimit(200_000)]
    public async Task Chat([FromBody] ChatRequestDto request, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) { await Unauthorized().ExecuteResultAsync(ControllerContext); return; }
        if (!await licenses.HasAccessAsync(user.Id, ct)) { await LicenseRequired().ExecuteResultAsync(ControllerContext); return; }

        var error = Validate(request.Messages);
        if (error is not null) { await BadRequest(new { error }).ExecuteResultAsync(ControllerContext); return; }

        if (!Busy.TryAdd(user.Id, 0))
        {
            await StatusCode(429, new { error = "Wait for the current reply to finish." }).ExecuteResultAsync(ControllerContext);
            return;
        }
        try
        {
            var quota = await quotas.GetAsync(user.Id, ct);
            if (quota.LimitReached)
            {
                await StatusCode(429, new { error = LimitMessage(quota), code = "ai_limit", quota = ToDto(quota) }).ExecuteResultAsync(ControllerContext);
                return;
            }
            await StreamAsync(user.Id, request.Messages!, ct);
        }
        finally { Busy.TryRemove(user.Id, out _); }
    }

    private async Task StreamAsync(Guid userId, IReadOnlyList<ChatMessage> messages, CancellationToken ct)
    {
        var meter = new ChatUsageMeter();
        await using var reply = chat.StreamReplyAsync(messages, meter, ct).GetAsyncEnumerator(ct);
        bool hasFirst;
        try
        {
            // Wait for the first fragment before committing to a 200, so "model is down" can still be a proper 503.
            hasFirst = await reply.MoveNextAsync();
        }
        catch (ChatUnavailableException ex)
        {
            await StatusCode(503, new { error = ex.Message }).ExecuteResultAsync(ControllerContext);
            return;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return;
        }

        Response.ContentType = "text/plain; charset=utf-8";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no"; // nginx: pass fragments through instead of buffering the whole reply
        if (!hasFirst) return;
        var replyChars = 0;
        try
        {
            do
            {
                replyChars += reply.Current.Length;
                await Response.WriteAsync(reply.Current, ct);
                await Response.Body.FlushAsync(ct);
            } while (await reply.MoveNextAsync());
        }
        catch (ChatUnavailableException ex)
        {
            // Headers are already sent; end the text with a note the user can see.
            logger.LogWarning(ex, "Chat stream ended early");
            await Response.WriteAsync("\n\n[" + ex.Message + "]", CancellationToken.None);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // The user pressed Stop or left the page.
        }
        finally
        {
            // Counted once the model has started answering, so an offline model or a failed request costs nothing.
            // The model reports exact tokens at the end; a reply cut short is estimated from its length instead.
            var tokens = meter.Reported ? meter.Total : AiQuotaRules.EstimateTokens(messages.Sum(m => m.Content.Length) + replyChars + SystemPromptAllowance);
            await quotas.RecordAsync(userId, tokens, CancellationToken.None);
        }
    }

    /// <summary>Characters added for the system prompt when a reply's tokens have to be estimated.</summary>
    private const int SystemPromptAllowance = 400;

    public static string? Validate(IReadOnlyList<ChatMessage>? messages)
    {
        if (messages is null || messages.Count == 0) return "Write a message first.";
        if (messages.Count > MaxMessages) return "This conversation is too long. Start a new chat.";
        if (messages.Any(m => m is null || m.Role is not ("user" or "assistant") || string.IsNullOrWhiteSpace(m.Content)))
            return "The conversation contains an invalid message.";
        if (messages[^1].Role != "user") return "The last message must be yours.";
        if (messages.Any(m => m.Content.Length > MaxMessageChars)) return $"Each message can be at most {MaxMessageChars:N0} characters.";
        if (messages.Sum(m => m.Content.Length) > MaxTotalChars) return "This conversation is too long. Start a new chat.";
        return null;
    }

    private static AiQuotaDto ToDto(AiQuota q) => new(q.PercentUsed, q.LimitReached, q.Plan, q.PlanName, q.PlanExpiresAt, q.NextFreeAt);

    private static string LimitMessage(AiQuota q) =>
        $"You've used 100% of your {q.PlanName} pack's AI allowance for the last 24 hours. Get a bigger pack, or wait until some of it frees up.";

    private ObjectResult LicenseRequired() => StatusCode(402, new { error = "An active license is required to use this tool." });
}
