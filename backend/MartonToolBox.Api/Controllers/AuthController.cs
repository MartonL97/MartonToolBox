using System.Net;
using System.Text;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Api.Services;
using MartonToolBox.Application.Email;
using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Caching.Memory;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/auth")]
public sealed class AuthController(
    UserManager<AppUser> users, TokenService tokens, IEmailSender email, IMemoryCache cache,
    IConfiguration configuration, ILogger<AuthController> logger) : ControllerBase
{
    private static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<RegisterResult>>> Register(RegisterRequest request, CancellationToken ct)
    {
        if (request.Password != request.ConfirmPassword) return BadRequest(new { error = "The passwords don't match." });
        var user = new AppUser { UserName = request.Email, Email = request.Email, DisplayName = request.DisplayName.Trim() };
        var created = await users.CreateAsync(user, request.Password);
        if (!created.Succeeded) return BadRequest(new { errors = created.Errors.Select(e => new { e.Code, e.Description }) });

        cache.Set(CooldownKey("confirm", user.Email!), true, ResendCooldown);
        return Ok(new ApiResponse<RegisterResult>(new RegisterResult(user.Email!, await SendConfirmationAsync(user, ct))));
    }

    /// <summary>Activates the account from the emailed link and signs the user in.</summary>
    [HttpPost("confirm-email")]
    public async Task<ActionResult<ApiResponse<AuthResult>>> ConfirmEmail(ConfirmEmailRequest request)
    {
        var user = await users.FindByIdAsync(request.UserId.ToString());
        if (user is null || !user.IsActive) return BadRequest(new { error = "This confirmation link is invalid." });
        // Don't turn an old link into a way to sign in: confirmed accounts just log in normally.
        if (user.EmailConfirmed) return Conflict(new { error = "Your email is already confirmed. Please log in.", code = "already_confirmed" });

        var token = DecodeToken(request.Token);
        if (token is null) return BadRequest(new { error = "This confirmation link is invalid." });

        var result = await users.ConfirmEmailAsync(user, token);
        if (!result.Succeeded) return BadRequest(new { error = "This confirmation link is invalid or has expired. Request a new one below.", code = "invalid_token" });
        return Ok(new ApiResponse<AuthResult>(CreateResult(user)));
    }

    /// <summary>Always answers the same way, so it can't be used to find out which emails have accounts.</summary>
    [HttpPost("resend-confirmation")]
    public async Task<IActionResult> ResendConfirmation(ResendConfirmationRequest request, CancellationToken ct)
    {
        var key = CooldownKey("confirm", request.Email);
        if (!cache.TryGetValue(key, out _))
        {
            cache.Set(key, true, ResendCooldown);
            var user = await users.FindByEmailAsync(request.Email);
            if (user is { EmailConfirmed: false, IsActive: true }) await SendConfirmationAsync(user, ct);
        }
        return Ok(new ApiResponse<string>("If an unconfirmed account exists for this email, a new confirmation link is on its way."));
    }

    /// <summary>Emails a reset link. Same answer whether or not the account exists, so emails can't be probed.</summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        var key = CooldownKey("reset", request.Email);
        if (!cache.TryGetValue(key, out _))
        {
            cache.Set(key, true, ResendCooldown);
            var user = await users.FindByEmailAsync(request.Email);
            if (user is { IsActive: true }) await SendPasswordResetAsync(user, ct);
        }
        return Ok(new ApiResponse<string>("If an account exists for this email, a password reset link is on its way."));
    }

    /// <summary>Sets a new password from the emailed link and signs the user in.</summary>
    [HttpPost("reset-password")]
    public async Task<ActionResult<ApiResponse<AuthResult>>> ResetPassword(ResetPasswordRequest request)
    {
        if (request.Password != request.ConfirmPassword) return BadRequest(new { error = "The passwords don't match." });
        var user = await users.FindByIdAsync(request.UserId.ToString());
        var token = DecodeToken(request.Token);
        if (user is null || !user.IsActive || token is null) return BadRequest(new { error = "This reset link is invalid or has expired. Request a new one below.", code = "invalid_token" });

        var result = await users.ResetPasswordAsync(user, token, request.Password);
        if (!result.Succeeded)
        {
            // Identity reports a bad/expired/used token as "InvalidToken"; anything else is a password rule.
            if (result.Errors.Any(e => e.Code == "InvalidToken")) return BadRequest(new { error = "This reset link is invalid or has expired. Request a new one below.", code = "invalid_token" });
            return BadRequest(new { errors = result.Errors.Select(e => new { e.Code, e.Description }) });
        }

        // Receiving the link proves the user owns the inbox, so this also activates an unconfirmed account.
        if (!user.EmailConfirmed) { user.EmailConfirmed = true; await users.UpdateAsync(user); }
        return Ok(new ApiResponse<AuthResult>(CreateResult(user)));
    }

    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthResult>>> Login(LoginRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive || !await users.CheckPasswordAsync(user, request.Password)) return Unauthorized(new { error = "Invalid email or password." });
        // Checked after the password, so this only reveals the account state to its owner.
        if (!user.EmailConfirmed) return StatusCode(StatusCodes.Status403Forbidden, new { error = "Please confirm your email first. Check your inbox for the confirmation link.", code = "email_not_confirmed" });
        return Ok(new ApiResponse<AuthResult>(CreateResult(user)));
    }

    [HttpPost("refresh")]
    public ActionResult<ApiResponse<AuthResult>> Refresh(RefreshRequest request) => StatusCode(StatusCodes.Status501NotImplemented, new { error = "Refresh-token persistence is prepared for the next auth hardening pass." });

    private AuthResult CreateResult(AppUser user) { var (token, expiry) = tokens.CreateAccessToken(user); return new AuthResult(token, tokens.CreateRefreshToken(), expiry, new UserDto(user.Id, user.Email!, user.DisplayName)); }

    private static string CooldownKey(string kind, string emailAddress) => $"{kind}-mail:" + emailAddress.Trim().ToUpperInvariant();

    private string FrontendUrl(string path) => (configuration["Frontend:BaseUrl"] ?? "http://localhost:4200").TrimEnd('/') + path;

    private static string EncodeToken(string token) => WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

    private static string? DecodeToken(string token)
    {
        try { return Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token)); }
        catch (FormatException) { return null; }
    }

    /// <summary>Returns false (and logs) when the email couldn't be sent; the user can retry with "resend".</summary>
    private async Task<bool> SendConfirmationAsync(AppUser user, CancellationToken ct)
    {
        var link = FrontendUrl($"/confirm-email?userId={user.Id}&token={EncodeToken(await users.GenerateEmailConfirmationTokenAsync(user))}");
        return await TrySendAsync(user, "Confirm your MartonToolBox account",
            "Confirm your email", $"Hi {WebUtility.HtmlEncode(user.DisplayName)}, thanks for signing up! Click the button below to activate your account.",
            "Confirm my email", link, "The link is valid for 24 hours. If you didn't create an account, you can ignore this email.", ct);
    }

    private async Task<bool> SendPasswordResetAsync(AppUser user, CancellationToken ct)
    {
        var link = FrontendUrl($"/reset-password?userId={user.Id}&token={EncodeToken(await users.GeneratePasswordResetTokenAsync(user))}");
        return await TrySendAsync(user, "Reset your MartonToolBox password",
            "Reset your password", $"Hi {WebUtility.HtmlEncode(user.DisplayName)}, we received a request to reset your password. Click the button below to choose a new one.",
            "Reset password", link, "The link is valid for 1 hour and can be used once. If you didn't ask for this, you can ignore this email — your password won't change.", ct);
    }

    private async Task<bool> TrySendAsync(AppUser user, string subject, string title, string introHtml, string button, string link, string footnote, CancellationToken ct)
    {
        var text = $"{WebUtility.HtmlDecode(introHtml)}\n\n{button}: {link}\n\n{footnote}";
        try
        {
            await email.SendAsync(user.Email!, user.DisplayName, subject, EmailLayout(title, introHtml, button, link, footnote), text, ct);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not send \"{Subject}\" to {Email}.", subject, user.Email);
            return false;
        }
    }

    private static string EmailLayout(string title, string introHtml, string button, string link, string footnote) => $"""
        <!doctype html><html><body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:32px 12px"><tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e9f1">
              <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);background-color:#4f46e5;padding:28px 32px;color:#ffffff;font-size:20px;font-weight:bold">⚡ MartonToolBox</td></tr>
              <tr><td style="padding:32px">
                <h1 style="margin:0 0 12px;font-size:22px">{title}</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569">{introHtml}</p>
                <p style="margin:0 0 24px"><a href="{link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 24px;border-radius:10px">{button}</a></p>
                <p style="margin:0 0 8px;font-size:13px;color:#8a94a8">Or paste this link into your browser:</p>
                <p style="margin:0 0 20px;font-size:12px;word-break:break-all"><a href="{link}" style="color:#4f46e5">{link}</a></p>
                <p style="margin:0;font-size:13px;color:#8a94a8">{footnote}</p>
              </td></tr>
            </table>
          </td></tr></table>
        </body></html>
        """;
}
