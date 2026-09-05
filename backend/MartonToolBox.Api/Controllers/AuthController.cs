using MartonToolBox.Api.Contracts;
using MartonToolBox.Api.Services;
using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/auth")]
public sealed class AuthController(UserManager<AppUser> users, TokenService tokens) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<AuthResult>>> Register(RegisterRequest request)
    {
        var user = new AppUser { UserName = request.Email, Email = request.Email, DisplayName = request.DisplayName.Trim() };
        var created = await users.CreateAsync(user, request.Password);
        if (!created.Succeeded) return BadRequest(new { errors = created.Errors.Select(e => new { e.Code, e.Description }) });
        return Ok(new ApiResponse<AuthResult>(CreateResult(user)));
    }
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthResult>>> Login(LoginRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive || !await users.CheckPasswordAsync(user, request.Password)) return Unauthorized(new { error = "Invalid email or password." });
        return Ok(new ApiResponse<AuthResult>(CreateResult(user)));
    }
    [HttpPost("refresh")]
    public ActionResult<ApiResponse<AuthResult>> Refresh(RefreshRequest request) => StatusCode(StatusCodes.Status501NotImplemented, new { error = "Refresh-token persistence is prepared for the next auth hardening pass." });
    private AuthResult CreateResult(AppUser user) { var (token, expiry) = tokens.CreateAccessToken(user); return new AuthResult(token, tokens.CreateRefreshToken(), expiry, new UserDto(user.Id, user.Email!, user.DisplayName)); }
}
