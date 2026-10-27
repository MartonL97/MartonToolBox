using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MartonToolBox.Infrastructure.Identity;

/// <summary>Password reset links get their own, shorter lifetime than email confirmation links (24 h).</summary>
public sealed class PasswordResetTokenProviderOptions : DataProtectionTokenProviderOptions
{
    public PasswordResetTokenProviderOptions()
    {
        Name = PasswordResetTokenProvider<object>.ProviderName;
        TokenLifespan = TimeSpan.FromHours(1);
    }
}

public sealed class PasswordResetTokenProvider<TUser>(
    IDataProtectionProvider dataProtectionProvider, IOptions<PasswordResetTokenProviderOptions> options, ILogger<DataProtectorTokenProvider<TUser>> logger)
    : DataProtectorTokenProvider<TUser>(dataProtectionProvider, options, logger) where TUser : class
{
    public const string ProviderName = "PasswordReset";
}
