using System.Security.Claims;
using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/account"), Authorize]
public sealed class AccountController(UserManager<AppUser> users, ILicenseService licenses) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<object>>> Get() { var user = await users.GetUserAsync(User); if (user is null) return Unauthorized(); var license = await licenses.GetActiveLicenseAsync(user.Id); return Ok(new ApiResponse<object>(new { user = new UserDto(user.Id, user.Email!, user.DisplayName), license })); }
}
