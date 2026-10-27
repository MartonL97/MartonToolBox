using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;

namespace MartonToolBox.Api.Services;

public static class AdminPolicy
{
    public const string Name = "Admin";
    public const string Role = "Admin";
}

public sealed class AdminRequirement : IAuthorizationRequirement;

/// <summary>
/// Checks the Admin role in the database on every request rather than trusting a role claim baked
/// into the JWT, so granting or revoking admin (e.g. directly in AspNetUserRoles) takes effect immediately.
/// </summary>
public sealed class AdminRequirementHandler(UserManager<AppUser> users) : AuthorizationHandler<AdminRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, AdminRequirement requirement)
    {
        var user = await users.GetUserAsync(context.User);
        if (user is { IsActive: true } && await users.IsInRoleAsync(user, AdminPolicy.Role)) context.Succeed(requirement);
    }
}
