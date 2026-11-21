using System.ComponentModel.DataAnnotations;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Api.Services;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Controllers;

public sealed record ProfileDto(
    string DisplayName, string Email, string? Phone, string? Address, string? City, string? County, string? PostalCode,
    string? CompanyName, string? TaxId, DateTimeOffset MemberSince);

/// <summary>Everything except DisplayName is optional; empty strings are stored as "not set".</summary>
public sealed record UpdateProfileRequest(
    [Required, StringLength(120, MinimumLength = 2)] string DisplayName,
    [StringLength(30), RegularExpression(@"^[+\d][\d\s().-]{5,29}$", ErrorMessage = "Enter a valid phone number.")] string? Phone,
    [StringLength(250)] string? Address,
    [StringLength(80)] string? City,
    [StringLength(80)] string? County,
    [StringLength(12)] string? PostalCode,
    [StringLength(160)] string? CompanyName,
    [StringLength(20)] string? TaxId);

[ApiController, Route("api/account"), Authorize]
public sealed class AccountController(UserManager<AppUser> users, ILicenseService licenses, AppDbContext db) : ControllerBase
{
    public const int MaxAvatarBytes = 2 * 1024 * 1024;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<object>>> Get()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var license = await licenses.GetActiveLicenseAsync(user.Id);
        var licenseDto = license is null ? null : new LicenseDto(license.LicenseKey, license.Product.ToString(), license.Status.ToString(), license.PurchasedAt, license.ExpiresAt);
        var isAdmin = await users.IsInRoleAsync(user, AdminPolicy.Role);
        return Ok(new ApiResponse<object>(new { user = UserDto.From(user), license = licenseDto, isAdmin, profile = ToProfile(user) }));
    }

    [HttpPut("profile")]
    public async Task<ActionResult<ApiResponse<ProfileDto>>> UpdateProfile(UpdateProfileRequest request)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        user.DisplayName = request.DisplayName.Trim();
        user.PhoneNumber = Clean(request.Phone);
        user.Address = Clean(request.Address);
        user.City = Clean(request.City);
        user.County = Clean(request.County);
        user.PostalCode = Clean(request.PostalCode);
        user.CompanyName = Clean(request.CompanyName);
        user.TaxId = Clean(request.TaxId)?.ToUpperInvariant();
        user.UpdatedAt = DateTimeOffset.UtcNow;

        var result = await users.UpdateAsync(user);
        if (!result.Succeeded) return BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) });
        return Ok(new ApiResponse<ProfileDto>(ToProfile(user)));
    }

    /// <summary>Saves a new profile picture (JPEG, PNG, WebP or GIF, at most 2 MB) and returns its address.</summary>
    [HttpPut("avatar"), RequestSizeLimit(MaxAvatarBytes + 100_000)]
    public async Task<ActionResult<ApiResponse<UserDto>>> UploadAvatar(IFormFile? file, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (file is null || file.Length == 0) return BadRequest(new { error = "Please choose an image." });
        if (file.Length > MaxAvatarBytes) return BadRequest(new { error = "The picture must be 2 MB or smaller." });

        using var buffer = new MemoryStream((int)file.Length);
        await file.CopyToAsync(buffer, ct);
        var data = buffer.ToArray();
        // Judged by the file's first bytes, not its name or the browser's claim, so only real images are stored.
        var contentType = ImageType(data);
        if (contentType is null) return BadRequest(new { error = "Please upload a JPEG, PNG, WebP or GIF image." });

        var avatar = await db.UserAvatars.FindAsync([user.Id], ct);
        if (avatar is null) db.UserAvatars.Add(avatar = new UserAvatar { UserId = user.Id });
        avatar.Data = data;
        avatar.ContentType = contentType;
        avatar.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        user.AvatarUpdatedAt = avatar.UpdatedAt;
        user.UpdatedAt = avatar.UpdatedAt;
        await users.UpdateAsync(user);
        return Ok(new ApiResponse<UserDto>(UserDto.From(user)));
    }

    [HttpDelete("avatar")]
    public async Task<ActionResult<ApiResponse<UserDto>>> DeleteAvatar(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        await db.UserAvatars.Where(a => a.UserId == user.Id).ExecuteDeleteAsync(ct);
        user.AvatarUpdatedAt = null;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await users.UpdateAsync(user);
        return Ok(new ApiResponse<UserDto>(UserDto.From(user)));
    }

    /// <summary>
    /// Serves a profile picture without sign-in, so it works in a plain img tag. The address holds the user's random
    /// ID and the change time, so it can't be guessed and can be cached for good.
    /// </summary>
    [HttpGet("avatar/{userId:guid}"), AllowAnonymous]
    public async Task<IActionResult> GetAvatar(Guid userId, CancellationToken ct)
    {
        var avatar = await db.UserAvatars.AsNoTracking().FirstOrDefaultAsync(a => a.UserId == userId, ct);
        if (avatar is null) return NotFound();
        Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        return File(avatar.Data, avatar.ContentType);
    }

    private static string? ImageType(byte[] b)
    {
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length >= 8 && b.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "image/png";
        if (b.Length >= 6 && (b.AsSpan(0, 6).SequenceEqual("GIF87a"u8) || b.AsSpan(0, 6).SequenceEqual("GIF89a"u8))) return "image/gif";
        if (b.Length >= 12 && b.AsSpan(0, 4).SequenceEqual("RIFF"u8) && b.AsSpan(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }

    private static ProfileDto ToProfile(AppUser u) => new(
        u.DisplayName, u.Email!, u.PhoneNumber, u.Address, u.City, u.County, u.PostalCode, u.CompanyName, u.TaxId, u.CreatedAt);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
