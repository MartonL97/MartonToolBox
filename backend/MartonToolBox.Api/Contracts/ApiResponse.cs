namespace MartonToolBox.Api.Contracts;
public sealed record ApiResponse<T>(T Data, string? Message = null);
