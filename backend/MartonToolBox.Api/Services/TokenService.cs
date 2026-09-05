using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using MartonToolBox.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace MartonToolBox.Api.Services;

public sealed class TokenService(IConfiguration configuration)
{
    public (string Token, DateTimeOffset ExpiresAt) CreateAccessToken(AppUser user)
    {
        var expiry = DateTimeOffset.UtcNow.AddMinutes(configuration.GetValue<int?>("Jwt:ExpiryMinutes") ?? 30);
        var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty), new Claim("display_name", user.DisplayName) };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:Key"]!));
        var token = new JwtSecurityToken(configuration["Jwt:Issuer"], configuration["Jwt:Audience"], claims, expires: expiry.UtcDateTime, signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), expiry);
    }
    public string CreateRefreshToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
}
