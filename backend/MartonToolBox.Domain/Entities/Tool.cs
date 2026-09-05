namespace MartonToolBox.Domain.Entities;

public sealed class Tool
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Icon { get; set; } = "tool";
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }
}
