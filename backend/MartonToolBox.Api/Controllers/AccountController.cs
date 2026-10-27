using System.ComponentModel.DataAnnotations;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Api.Services;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

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
public sealed class AccountController(UserManager<AppUser> users, ILicenseService licenses) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<object>>> Get()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var license = await licenses.GetActiveLicenseAsync(user.Id);
        var licenseDto = license is null ? null : new LicenseDto(license.LicenseKey, license.Product.ToString(), license.Status.ToString(), license.PurchasedAt, license.ExpiresAt);
        var isAdmin = await users.IsInRoleAsync(user, AdminPolicy.Role);
        return Ok(new ApiResponse<object>(new { user = new UserDto(user.Id, user.Email!, user.DisplayName), license = licenseDto, isAdmin, profile = ToProfile(user) }));
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

    private static ProfileDto ToProfile(AppUser u) => new(
        u.DisplayName, u.Email!, u.PhoneNumber, u.Address, u.City, u.County, u.PostalCode, u.CompanyName, u.TaxId, u.CreatedAt);

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
