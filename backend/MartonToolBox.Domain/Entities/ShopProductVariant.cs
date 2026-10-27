namespace MartonToolBox.Domain.Entities;

/// <summary>A purchasable size of a product, with its own stock. Products without variants use ShopProduct.Stock.</summary>
public sealed class ShopProductVariant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProductId { get; set; }
    public string Size { get; set; } = string.Empty;
    public int Stock { get; set; }
    public int SortOrder { get; set; }
}
