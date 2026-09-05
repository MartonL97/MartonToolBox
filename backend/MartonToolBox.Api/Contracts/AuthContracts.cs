using System.ComponentModel.DataAnnotations;

namespace MartonToolBox.Api.Contracts;
public sealed record RegisterRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)] string Password,
    [Required] string DisplayName);
public sealed record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
public sealed record RefreshRequest(string RefreshToken);
public sealed record AuthResult(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, UserDto User);
public sealed record UserDto(Guid Id, string Email, string DisplayName);
