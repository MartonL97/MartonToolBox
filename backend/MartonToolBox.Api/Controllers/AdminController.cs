using MartonToolBox.Api.Contracts;
using System.ComponentModel.DataAnnotations;
using MartonToolBox.Application.Shipping;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using MartonToolBox.Api.Services;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Controllers;

public sealed record ActiveLicenseDto(Guid Id, string UserEmail, string DisplayName, string LicenseKey, string Product, DateTimeOffset PurchasedAt, DateTimeOffset? ExpiresAt);
public sealed record AdminSizeDto(string Size, int Stock);
public sealed record AdminProductDto(Guid Id, string Slug, string Name, string Description, decimal Price, string Currency, string? ImageUrl, int Stock, bool IsActive, int SortOrder, IReadOnlyList<AdminSizeDto> Sizes);
public sealed record SaveSizeRequest([Required, StringLength(20, MinimumLength = 1)] string Size, [Range(0, 1_000_000)] int Stock);
/// <summary>When Sizes is non-empty, stock is tracked per size and Stock is ignored.</summary>
public sealed record SaveProductRequest(
    [Required, RegularExpression("^[a-z0-9-]{2,80}$")] string Slug,
    [Required, StringLength(120, MinimumLength = 2)] string Name,
    [StringLength(1000)] string? Description,
    [Range(0.01, 1_000_000)] decimal Price,
    // A full http(s) URL or a path served by the frontend, e.g. /images/shop/x.jpg
    [RegularExpression(@"^(https?://|/)\S+$", ErrorMessage = "Image must be an http(s) URL or a path starting with /."), StringLength(500)] string? ImageUrl,
    [Range(0, 1_000_000)] int Stock,
    bool IsActive,
    int SortOrder,
    IReadOnlyList<SaveSizeRequest>? Sizes);
public sealed record SetVisibilityRequest(bool IsActive);
/// <summary>One stock-keeping line: a size of a sized product, or the product itself when it has no sizes.</summary>
public sealed record InventoryRowDto(Guid ProductId, Guid? VariantId, string ProductName, string? Size, bool IsActive, int OnHand, int Reserved, int AwaitingShipment, int Available);
public sealed record InventoryDto(IReadOnlyList<InventoryRowDto> Rows, int LowStockThreshold, int ReservationMinutes);
/// <summary>VariantId is null for a product without sizes.</summary>
public sealed record SetStockItem(Guid? VariantId, [Range(0, 1_000_000)] int Stock);
public sealed record SetProductStockRequest([Required, MinLength(1)] IReadOnlyList<SetStockItem> Items);
public sealed record AdvanceOrderRequest([Required] string Stage);
public sealed record SetTrackingRequest([StringLength(64)] string? TrackingNumber);
public sealed record SetTrackingResult(string? TrackingNumber, string? CourierStatus);
public sealed record AdminShopOrderDto(ShopOrderDto Order, string UserEmail, string? ShippingName, string? ShippingPhone, string? ShippingAddress, string? ShippingCity, string? ShippingCounty, string? ShippingPostalCode);

/// <summary>
/// Store administration: shop products and orders, plus the list of active licenses (which can be revoked).
/// Only users with the Admin role, checked per request, can call these.
/// </summary>
[ApiController, Route("api/admin"), Authorize(Policy = AdminPolicy.Name)]
public sealed class AdminController(AppDbContext db, PayUPaymentService payu, ICourierTracking courier, IConfiguration configuration, ILogger<AdminController> logger) : ControllerBase
{
    /// <summary>Everyone with an active license, newest first.</summary>
    [HttpGet("licenses")]
    public async Task<ActionResult<ApiResponse<List<ActiveLicenseDto>>>> ActiveLicenses(CancellationToken ct)
    {
        var licenses = await db.Licenses
            .Where(l => l.Status == LicenseStatus.Active)
            .OrderByDescending(l => l.PurchasedAt)
            .Join(db.Users, l => l.UserId, u => u.Id, (l, u) => new ActiveLicenseDto(l.Id, u.Email!, u.DisplayName, l.LicenseKey, l.Product.ToString(), l.PurchasedAt, l.ExpiresAt))
            .ToListAsync(ct);
        return Ok(new ApiResponse<List<ActiveLicenseDto>>(licenses));
    }

    /// <summary>
    /// Takes the license away: it is marked Revoked rather than deleted, so the key stays unique and the
    /// record remains for history. The user loses tool access on their next request.
    /// </summary>
    [HttpDelete("licenses/{id:guid}")]
    public async Task<IActionResult> RevokeLicense(Guid id, CancellationToken ct)
    {
        var license = await db.Licenses.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (license is null) return NotFound();
        license.Status = LicenseStatus.Revoked;
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<Guid>(id));
    }

    [HttpGet("shop/products")]
    public async Task<ActionResult<ApiResponse<List<AdminProductDto>>>> ShopProducts(CancellationToken ct)
    {
        var products = await db.ShopProducts.OrderBy(p => p.SortOrder).ThenBy(p => p.Name).ToListAsync(ct);
        var sizes = await ShopController.LoadSizesAsync(db, products.Select(p => p.Id), ct);
        return Ok(new ApiResponse<List<AdminProductDto>>(products.Select(p => new AdminProductDto(
            p.Id, p.Slug, p.Name, p.Description, p.Price, p.Currency, p.ImageUrl, p.Stock, p.IsActive, p.SortOrder,
            sizes[p.Id].Select(v => new AdminSizeDto(v.Size, v.Stock)).ToList())).ToList()));
    }

    [HttpPost("shop/products")]
    public async Task<IActionResult> CreateProduct(SaveProductRequest request, CancellationToken ct)
    {
        if (await db.ShopProducts.AnyAsync(p => p.Slug == request.Slug, ct)) return Conflict(new { error = "Another product already uses this slug." });
        if (DuplicateSize(request) is { } dup) return BadRequest(new { error = $"Size \"{dup}\" is listed twice." });
        var product = new ShopProduct { Currency = configuration["Shop:Currency"] ?? "RON" };
        Apply(product, request);
        db.ShopProducts.Add(product);
        await SyncSizesAsync(product.Id, request.Sizes, ct);
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<Guid>(product.Id));
    }

    [HttpPut("shop/products/{id:guid}")]
    public async Task<IActionResult> UpdateProduct(Guid id, SaveProductRequest request, CancellationToken ct)
    {
        var product = await db.ShopProducts.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        if (await db.ShopProducts.AnyAsync(p => p.Slug == request.Slug && p.Id != id, ct)) return Conflict(new { error = "Another product already uses this slug." });
        if (DuplicateSize(request) is { } dup) return BadRequest(new { error = $"Size \"{dup}\" is listed twice." });
        Apply(product, request);
        await SyncSizesAsync(product.Id, request.Sizes, ct);
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<Guid>(product.Id));
    }

    [HttpPut("shop/products/{id:guid}/visibility")]
    public async Task<IActionResult> SetVisibility(Guid id, SetVisibilityRequest request, CancellationToken ct)
    {
        var product = await db.ShopProducts.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        product.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<bool>(product.IsActive));
    }

    /// <summary>
    /// Removes the product and its sizes. Past orders keep their own copy of name, size and price,
    /// so order history is unaffected; carts holding it drop the line on their next catalog refresh.
    /// </summary>
    [HttpDelete("shop/products/{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id, CancellationToken ct)
    {
        var product = await db.ShopProducts.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (product is null) return NotFound();
        db.ShopProductVariants.RemoveRange(await db.ShopProductVariants.Where(v => v.ProductId == id).ToListAsync(ct));
        db.ShopProducts.Remove(product);
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<Guid>(id));
    }

    /// <summary>
    /// Stock per product and size. OnHand is what's in the warehouse (paid orders are already deducted, including
    /// those still to ship); Reserved is held by unpaid checkouts; Available = OnHand - Reserved is what shoppers can buy.
    /// </summary>
    [HttpGet("inventory")]
    public async Task<ActionResult<ApiResponse<InventoryDto>>> Inventory(CancellationToken ct)
    {
        var window = ShopController.ReservationWindowFrom(configuration);
        var products = await db.ShopProducts.OrderBy(p => p.SortOrder).ThenBy(p => p.Name).ToListAsync(ct);
        var sizes = await ShopController.LoadSizesAsync(db, products.Select(p => p.Id), ct);
        var reserved = await ShopController.LoadReservedAsync(db, window, ct);
        var toShip = await db.OrderItems
            .Where(i => db.Orders.Any(o => o.Id == i.OrderId && o.Kind == OrderKinds.Shop && o.Status == "Paid" && o.ShippedAt == null))
            .GroupBy(i => new { i.ProductId, i.VariantId })
            .Select(g => new { g.Key.ProductId, g.Key.VariantId, Quantity = g.Sum(i => i.Quantity) })
            .ToDictionaryAsync(r => (r.ProductId, r.VariantId), r => r.Quantity, ct);

        InventoryRowDto Row(ShopProduct p, Guid? variantId, string? size, int onHand) => new(
            p.Id, variantId, p.Name, size, p.IsActive, onHand,
            reserved.GetValueOrDefault((p.Id, variantId)), toShip.GetValueOrDefault((p.Id, variantId)),
            ShopController.Available(onHand, reserved, p.Id, variantId));

        var rows = products.SelectMany(p => sizes[p.Id].Any()
            ? sizes[p.Id].Select(v => Row(p, v.Id, v.Size, v.Stock))
            : [Row(p, null, null, p.Stock)]).ToList();
        return Ok(new ApiResponse<InventoryDto>(new InventoryDto(rows, configuration.GetValue<int?>("Shop:LowStockThreshold") ?? 3, (int)window.TotalMinutes)));
    }

    /// <summary>
    /// Sets on-hand counts for one product after a restock or stock-take: any of its sizes in one go,
    /// or its single count when it has no sizes. Nothing is saved if any line is invalid.
    /// </summary>
    [HttpPut("inventory/{productId:guid}")]
    public async Task<IActionResult> SetProductStock(Guid productId, SetProductStockRequest request, CancellationToken ct)
    {
        var product = await db.ShopProducts.FirstOrDefaultAsync(p => p.Id == productId, ct);
        if (product is null) return NotFound();
        if (request.Items.GroupBy(i => i.VariantId).Any(g => g.Count() > 1)) return BadRequest(new { error = "A size is listed twice." });
        var variants = await db.ShopProductVariants.Where(v => v.ProductId == productId).ToDictionaryAsync(v => v.Id, ct);
        foreach (var item in request.Items)
        {
            if (item.VariantId is { } variantId)
            {
                if (!variants.TryGetValue(variantId, out var variant)) return BadRequest(new { error = "One of the sizes no longer exists. Reload and try again." });
                variant.Stock = item.Stock;
            }
            else if (variants.Count > 0) return BadRequest(new { error = "This product has sizes; set stock per size." });
            else product.Stock = item.Stock;
        }
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<Guid>(productId));
    }

    [HttpGet("shop/orders")]
    public async Task<ActionResult<ApiResponse<List<AdminShopOrderDto>>>> ShopOrders(CancellationToken ct)
    {
        var orders = await db.Orders.Where(o => o.Kind == OrderKinds.Shop && o.Status != "Failed").OrderByDescending(o => o.CreatedAt).Take(200).ToListAsync(ct);
        var dtos = (await ShopController.LoadOrdersAsync(db, db.Orders.Where(o => orders.Select(x => x.Id).Contains(o.Id)), ct)).ToDictionary(d => d.Id);
        var userIds = orders.Select(o => o.UserId).Distinct().ToList();
        var emails = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email ?? string.Empty, ct);
        return Ok(new ApiResponse<List<AdminShopOrderDto>>(orders.Select(o => new AdminShopOrderDto(dtos[o.Id], emails.GetValueOrDefault(o.UserId, ""),
            o.ShippingName, o.ShippingPhone, o.ShippingAddress, o.ShippingCity, o.ShippingCounty, o.ShippingPostalCode)).ToList()));
    }

    /// <summary>
    /// Moves a paid order to its next delivery step. The caller names the step it means, so a double click or
    /// a stale page can't skip one.
    /// </summary>
    [HttpPost("shop/orders/{orderId:guid}/advance")]
    public async Task<IActionResult> AdvanceOrder(Guid orderId, AdvanceOrderRequest request, CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.Kind == OrderKinds.Shop, ct);
        if (order is null) return NotFound();
        if (order.Status != "Paid") return BadRequest(new { error = "Only paid orders can move through delivery." });
        var steps = new (string Name, DateTimeOffset? At, Action<DateTimeOffset> Set)[]
        {
            ("Prepared", order.PreparedAt, t => order.PreparedAt = t),
            ("Shipped", order.ShippedAt, t => order.ShippedAt = t),
            ("AtCourierDepot", order.AtCourierDepotAt, t => order.AtCourierDepotAt = t),
            ("OutForDelivery", order.OutForDeliveryAt, t => order.OutForDeliveryAt = t),
            ("Delivered", order.DeliveredAt, t => order.DeliveredAt = t),
        };
        var next = Array.FindLastIndex(steps, s => s.At is not null) + 1;
        if (next == steps.Length || steps[next].Name != request.Stage) return Conflict(new { error = "This order has already moved on. Reload the page." });
        steps[next].Set(DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<string>(request.Stage));
    }

    /// <summary>Sets or corrects the courier's AWB on a paid order and reads its status right away; an empty value removes it.</summary>
    [HttpPut("shop/orders/{orderId:guid}/tracking")]
    public async Task<IActionResult> SetTracking(Guid orderId, SetTrackingRequest request, CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.Kind == OrderKinds.Shop, ct);
        if (order is null) return NotFound();
        if (order.Status != "Paid") return BadRequest(new { error = "Only paid orders can have an AWB." });
        order.TrackingNumber = string.IsNullOrWhiteSpace(request.TrackingNumber) ? null : request.TrackingNumber.Trim();
        order.TrackingCheckedAt = null;
        if (order.TrackingNumber is null)
        {
            order.RegisteredAt = null;
            await db.SaveChangesAsync(ct);
            return Ok(new ApiResponse<SetTrackingResult>(new SetTrackingResult(null, null)));
        }

        // The AWB is saved whether or not Sameday answers; the background job tries again later.
        var events = await courier.GetEventsAsync(order.TrackingNumber, ct);
        if (events is not null)
        {
            CourierTimeline.Apply(order, events);
            order.TrackingCheckedAt = DateTimeOffset.UtcNow;
        }
        var now = DateTimeOffset.UtcNow;
        order.PreparedAt ??= now;
        order.RegisteredAt ??= now;
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<SetTrackingResult>(new SetTrackingResult(order.TrackingNumber, events?.LastOrDefault()?.Status)));
    }

    /// <summary>
    /// Cancels an unpaid order (whether or not the buyer asked) and closes its PayU payment, so it can't be
    /// paid later. It disappears from the buyer's order list. Refused if PayU says it has been paid meanwhile.
    /// </summary>
    [HttpPost("shop/orders/{orderId:guid}/cancel")]
    public async Task<IActionResult> CancelOrder(Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.Kind == OrderKinds.Shop, ct);
        if (order is null) return NotFound();
        if (order.Status is not ("Pending" or OrderStatuses.CancelRequested)) return BadRequest(new { error = "Only unpaid orders can be cancelled." });
        try
        {
            if (!await payu.CancelOrderAsync(orderId, ct)) return Conflict(new { error = "This order has just been paid, so it can't be cancelled here." });
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException)
        {
            logger.LogError(ex, "Could not cancel PayU payment for shop order {OrderId}.", orderId);
            return StatusCode(502, new { error = "Couldn't reach PayU to close the payment. Please try again in a moment." });
        }
        order.Status = OrderStatuses.Cancelled;
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<string>(order.Status));
    }

    /// <summary>
    /// Permanently removes a shop order with its lines and payment records. A paid order that has not shipped
    /// gives its items back to stock, since the goods never left.
    /// </summary>
    [HttpDelete("shop/orders/{orderId:guid}")]
    public async Task<IActionResult> DeleteOrder(Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.Kind == OrderKinds.Shop, ct);
        if (order is null) return NotFound();
        var items = await db.OrderItems.Where(i => i.OrderId == orderId).ToListAsync(ct);
        if (order.Status == "Paid" && order.ShippedAt is null)
        {
            var productIds = items.Select(i => i.ProductId).ToList();
            var products = await db.ShopProducts.Where(p => productIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
            var variantIds = items.Where(i => i.VariantId != null).Select(i => i.VariantId!.Value).ToList();
            var variants = await db.ShopProductVariants.Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
            foreach (var item in items)
            {
                if (item.VariantId is { } vid && variants.TryGetValue(vid, out var variant)) variant.Stock += item.Quantity;
                else if (products.TryGetValue(item.ProductId, out var product)) product.Stock += item.Quantity;
            }
        }
        db.OrderItems.RemoveRange(items);
        db.Payments.RemoveRange(await db.Payments.Where(p => p.OrderId == orderId).ToListAsync(ct));
        db.Orders.Remove(order);
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<Guid>(orderId));
    }

    private static void Apply(ShopProduct product, SaveProductRequest r)
    {
        product.Slug = r.Slug; product.Name = r.Name.Trim(); product.Description = r.Description?.Trim() ?? string.Empty;
        product.Price = r.Price; product.ImageUrl = string.IsNullOrWhiteSpace(r.ImageUrl) ? null : r.ImageUrl.Trim();
        product.Stock = r.Stock; product.IsActive = r.IsActive; product.SortOrder = r.SortOrder;
    }

    private static string? DuplicateSize(SaveProductRequest r) =>
        r.Sizes?.GroupBy(s => s.Size.Trim(), StringComparer.OrdinalIgnoreCase).FirstOrDefault(g => g.Count() > 1)?.Key;

    /// <summary>
    /// Makes the product's sizes match the request: existing sizes are updated in place (keeping their ids,
    /// which past orders and carts reference), new ones added, and missing ones removed.
    /// </summary>
    private async Task SyncSizesAsync(Guid productId, IReadOnlyList<SaveSizeRequest>? requested, CancellationToken ct)
    {
        requested ??= [];
        var existing = await db.ShopProductVariants.Where(v => v.ProductId == productId).ToListAsync(ct);
        for (var i = 0; i < requested.Count; i++)
        {
            var size = requested[i].Size.Trim().ToUpperInvariant();
            var variant = existing.FirstOrDefault(v => string.Equals(v.Size, size, StringComparison.OrdinalIgnoreCase));
            if (variant is null) db.ShopProductVariants.Add(variant = new ShopProductVariant { ProductId = productId, Size = size });
            variant.Stock = requested[i].Stock;
            variant.SortOrder = i;
        }
        db.ShopProductVariants.RemoveRange(existing.Where(v => !requested.Any(r => string.Equals(r.Size.Trim(), v.Size, StringComparison.OrdinalIgnoreCase))));
    }
}
