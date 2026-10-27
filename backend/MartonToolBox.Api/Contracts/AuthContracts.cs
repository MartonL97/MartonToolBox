using System.ComponentModel.DataAnnotations;

namespace MartonToolBox.Api.Contracts;
public sealed record RegisterRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(8)] string Password,
    [Required] string ConfirmPassword,
    [Required] string DisplayName);
/// <summary>Registration never signs the user in: the account stays inactive until the emailed link is used.</summary>
public sealed record RegisterResult(string Email, bool EmailSent);
public sealed record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
public sealed record ConfirmEmailRequest(Guid UserId, [Required] string Token);
public sealed record ResendConfirmationRequest([Required, EmailAddress] string Email);
public sealed record ForgotPasswordRequest([Required, EmailAddress] string Email);
public sealed record ResetPasswordRequest(Guid UserId, [Required] string Token, [Required, MinLength(8)] string Password, [Required] string ConfirmPassword);
public sealed record RefreshRequest(string RefreshToken);
public sealed record AuthResult(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, UserDto User);
public sealed record UserDto(Guid Id, string Email, string DisplayName);
public sealed record LicenseDto(string LicenseKey, string Product, string Status, DateTimeOffset PurchasedAt, DateTimeOffset? ExpiresAt);
