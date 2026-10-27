using System.ComponentModel.DataAnnotations;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Controllers;

public sealed record ShopVariantDto(Guid Id, string Size, int Stock);
/// <summary>Stock is the total across sizes when the product has sizes.</summary>
public sealed record ShopProductDto(Guid Id, string Slug, string Name, string Description, decimal Price, string Currency, string? ImageUrl, int Stock, IReadOnlyList<ShopVariantDto> Sizes);
public sealed record ShopCatalogDto(IReadOnlyList<ShopProductDto> Products, decimal ShippingCost, decimal FreeShippingOver, string Currency);
public sealed record CartLineRequest(Guid ProductId, Guid? VariantId, [Range(1, 99)] int Quantity);
public sealed record ShippingRequest(
    [Required, StringLength(120, MinimumLength = 2)] string Name,
    [Required, StringLength(30, MinimumLength = 6)] string Phone,
    [Required, StringLength(250, MinimumLength = 5)] string Address,
    [Required, StringLength(80, MinimumLength = 2)] string City,
    [Required, StringLength(80, MinimumLength = 2)] string County,
    [Required, StringLength(12, MinimumLength = 4)] string PostalCode);
public sealed record PlaceOrderRequest([Required, MinLength(1)] IReadOnlyList<CartLineRequest> Items, [Required] ShippingRequest Shipping);
public sealed record ShopOrderItemDto(string ProductName, string? Size, decimal UnitPrice, int Quantity);
public sealed record ShopOrderDto(Guid Id, string Status, decimal Amount, decimal ShippingCost, string Currency, DateTimeOffset CreatedAt, DateTimeOffset? ShippedAt, IReadOnlyList<ShopOrderItemDto> Items);

[ApiController, Route("api/shop")]
public sealed class ShopController(AppDbContext db, PayUPaymentService payu, UserManager<AppUser> users, IConfiguration configuration, ILogger<ShopController> logger) : ControllerBase
{
    private string Currency => configuration["Shop:Currency"] ?? "RON";
    private decimal ShippingCost => configuration.GetValue<decimal?>("Shop:ShippingCost") ?? 15m;
    private decimal FreeShippingOver => configuration.GetValue<decimal?>("Shop:FreeShippingOver") ?? 200m;

    [HttpGet("products"), AllowAnonymous]
    public async Task<ActionResult<ApiResponse<ShopCatalogDto>>> Products(CancellationToken ct)
    {
        var products = await db.ShopProducts.Where(p => p.IsActive).OrderBy(p => p.SortOrder).ThenBy(p => p.Name).ToListAsync(ct);
        var sizes = await LoadSizesAsync(db, products.Select(p => p.Id), ct);
        var dtos = products.Select(p => ToDto(p, sizes[p.Id].ToList())).ToList();
        return Ok(new ApiResponse<ShopCatalogDto>(new ShopCatalogDto(dtos, ShippingCost, FreeShippingOver, Currency)));
    }

    internal static ShopProductDto ToDto(ShopProduct p, IReadOnlyList<ShopProductVariant> sizes) => new(
        p.Id, p.Slug, p.Name, p.Description, p.Price, p.Currency, p.ImageUrl,
        sizes.Count > 0 ? sizes.Sum(v => v.Stock) : p.Stock,
        sizes.Select(v => new ShopVariantDto(v.Id, v.Size, v.Stock)).ToList());

    internal static async Task<ILookup<Guid, ShopProductVariant>> LoadSizesAsync(AppDbContext db, IEnumerable<Guid> productIds, CancellationToken ct)
    {
        var ids = productIds.ToList();
        return (await db.ShopProductVariants.Where(v => ids.Contains(v.ProductId)).OrderBy(v => v.SortOrder).ToListAsync(ct)).ToLookup(v => v.ProductId);
    }

    /// <summary>Prices, stock and shipping are all recomputed here - nothing the browser sends about money is trusted.</summary>
    [HttpPost("orders"), Authorize]
    public async Task<ActionResult<ApiResponse<CheckoutSession>>> PlaceOrder(PlaceOrderRequest request, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        var quantities = request.Items.GroupBy(i => (i.ProductId, i.VariantId)).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var productIds = quantities.Keys.Select(k => k.ProductId).Distinct().ToList();
        var products = await db.ShopProducts.Where(p => productIds.Contains(p.Id) && p.IsActive).ToDictionaryAsync(p => p.Id, ct);
        var sizes = await LoadSizesAsync(db, productIds, ct);
        var items = new List<OrderItem>();
        foreach (var ((productId, variantId), quantity) in quantities)
        {
            if (!products.TryGetValue(productId, out var product)) return BadRequest(new { error = "One of the products in your cart is no longer available." });
            var productSizes = sizes[productId].ToList();
            if (productSizes.Count == 0)
            {
                if (product.Stock < quantity) return BadRequest(new { error = $"Only {product.Stock} × {product.Name} left in stock." });
                items.Add(new OrderItem { ProductId = product.Id, ProductName = product.Name, UnitPrice = product.Price, Quantity = quantity });
                continue;
            }
            var variant = productSizes.FirstOrDefault(v => v.Id == variantId);
            if (variant is null) return BadRequest(new { error = $"Please choose a size for {product.Name}." });
            if (variant.Stock < quantity) return BadRequest(new { error = $"Only {variant.Stock} × {product.Name} (size {variant.Size}) left in stock." });
            items.Add(new OrderItem { ProductId = product.Id, VariantId = variant.Id, Size = variant.Size, ProductName = product.Name, UnitPrice = product.Price, Quantity = quantity });
        }

        var subtotal = items.Sum(i => i.UnitPrice * i.Quantity);
        var shipping = subtotal >= FreeShippingOver ? 0m : ShippingCost;
        var s = request.Shipping;
        var order = new Order
        {
            UserId = user.Id, Kind = OrderKinds.Shop, Product = "Shop", Currency = Currency, Status = "Pending",
            Amount = subtotal + shipping, ShippingCost = shipping,
            ShippingName = s.Name.Trim(), ShippingPhone = s.Phone.Trim(), ShippingAddress = s.Address.Trim(),
            ShippingCity = s.City.Trim(), ShippingCounty = s.County.Trim(), ShippingPostalCode = s.PostalCode.Trim()
        };
        foreach (var item in items) item.OrderId = order.Id;
        db.Orders.Add(order);
        db.OrderItems.AddRange(items);
        await db.SaveChangesAsync(ct);

        try
        {
            return Ok(new ApiResponse<CheckoutSession>(await payu.StartShopCheckoutAsync(order, items, ct)));
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
        {
            logger.LogError(ex, "Could not start PayU payment for shop order {OrderId}.", order.Id);
            order.Status = "Failed";
            await db.SaveChangesAsync(ct);
            return StatusCode(502, new { error = "The payment provider is unavailable right now. Please try again in a moment." });
        }
    }

    [HttpGet("orders"), Authorize]
    public async Task<ActionResult<ApiResponse<List<ShopOrderDto>>>> MyOrders(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        return Ok(new ApiResponse<List<ShopOrderDto>>(await LoadOrdersAsync(db.Orders.Where(o => o.UserId == user.Id), ct)));
    }

    [HttpGet("orders/{orderId:guid}"), Authorize]
    public async Task<ActionResult<ApiResponse<ShopOrderDto>>> Order(Guid orderId, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var order = (await LoadOrdersAsync(db.Orders.Where(o => o.Id == orderId && o.UserId == user.Id), ct)).FirstOrDefault();
        return order is null ? NotFound() : Ok(new ApiResponse<ShopOrderDto>(order));
    }

    /// <summary>Asks PayU for the latest status (the return page polls this) and returns the refreshed order.</summary>
    [HttpPost("orders/{orderId:guid}/confirm"), Authorize]
    public async Task<ActionResult<ApiResponse<ShopOrderDto>>> Confirm(Guid orderId, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await db.Orders.AnyAsync(o => o.Id == orderId && o.UserId == user.Id && o.Kind == OrderKinds.Shop, ct)) return NotFound();
        if (await db.Payments.AnyAsync(p => p.OrderId == orderId, ct)) await payu.ConfirmOrderAsync(orderId, ct);
        return await Order(orderId, ct);
    }

    internal static async Task<List<ShopOrderDto>> LoadOrdersAsync(AppDbContext db, IQueryable<Order> query, CancellationToken ct)
    {
        var orders = await query.Where(o => o.Kind == OrderKinds.Shop).OrderByDescending(o => o.CreatedAt).ToListAsync(ct);
        var ids = orders.Select(o => o.Id).ToList();
        var items = (await db.OrderItems.Where(i => ids.Contains(i.OrderId)).ToListAsync(ct)).ToLookup(i => i.OrderId);
        return orders.Select(o => new ShopOrderDto(o.Id, o.Status, o.Amount, o.ShippingCost, o.Currency, o.CreatedAt, o.ShippedAt,
            items[o.Id].Select(i => new ShopOrderItemDto(i.ProductName, i.Size, i.UnitPrice, i.Quantity)).ToList())).ToList();
    }

    private Task<List<ShopOrderDto>> LoadOrdersAsync(IQueryable<Order> query, CancellationToken ct) => LoadOrdersAsync(db, query, ct);
}
