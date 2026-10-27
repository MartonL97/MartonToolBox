using MartonToolBox.Api.Contracts;
using System.ComponentModel.DataAnnotations;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using MartonToolBox.Api.Services;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Controllers;

public sealed record ActiveLicenseDto(string UserEmail, string DisplayName, string LicenseKey, string Product, DateTimeOffset PurchasedAt, DateTimeOffset? ExpiresAt);
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
public sealed record AdminShopOrderDto(ShopOrderDto Order, string UserEmail, string? ShippingName, string? ShippingPhone, string? ShippingAddress, string? ShippingCity, string? ShippingCounty, string? ShippingPostalCode);

/// <summary>
/// Store administration: shop products and orders, plus a read-only list of active licenses.
/// Only users with the Admin role, checked per request, can call these.
/// </summary>
[ApiController, Route("api/admin"), Authorize(Policy = AdminPolicy.Name)]
public sealed class AdminController(AppDbContext db, IConfiguration configuration) : ControllerBase
{
    /// <summary>Everyone with an active license, newest first (read-only overview).</summary>
    [HttpGet("licenses")]
    public async Task<ActionResult<ApiResponse<List<ActiveLicenseDto>>>> ActiveLicenses(CancellationToken ct)
    {
        var licenses = await db.Licenses
            .Where(l => l.Status == LicenseStatus.Active)
            .OrderByDescending(l => l.PurchasedAt)
            .Join(db.Users, l => l.UserId, u => u.Id, (l, u) => new ActiveLicenseDto(u.Email!, u.DisplayName, l.LicenseKey, l.Product.ToString(), l.PurchasedAt, l.ExpiresAt))
            .ToListAsync(ct);
        return Ok(new ApiResponse<List<ActiveLicenseDto>>(licenses));
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

    [HttpPost("shop/orders/{orderId:guid}/ship")]
    public async Task<IActionResult> MarkShipped(Guid orderId, CancellationToken ct)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.Kind == OrderKinds.Shop, ct);
        if (order is null) return NotFound();
        if (order.Status != "Paid") return BadRequest(new { error = "Only paid orders can be marked as shipped." });
        order.ShippedAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<string>("Shipped"));
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
