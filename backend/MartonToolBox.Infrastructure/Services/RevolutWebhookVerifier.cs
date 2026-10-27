using System.Security.Cryptography;
using System.Text;

namespace MartonToolBox.Infrastructure.Services;

public static class RevolutWebhookVerifier
{
    private static readonly TimeSpan ToleranceWindow = TimeSpan.FromMinutes(5);

    public static bool Verify(string? signatureHeader, string? timestampHeader, string rawBody, string signingSecret)
    {
        if (string.IsNullOrEmpty(signatureHeader) || string.IsNullOrEmpty(timestampHeader) || string.IsNullOrEmpty(signingSecret)) return false;
        if (!long.TryParse(timestampHeader, out var timestampMs)) return false;

        var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeMilliseconds(timestampMs);
        if (age.Duration() > ToleranceWindow) return false;

        var signedPayload = $"v1.{timestampHeader}.{rawBody}";
        var expected = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(signingSecret), Encoding.UTF8.GetBytes(signedPayload))).ToLowerInvariant();
        var expectedBytes = Encoding.UTF8.GetBytes(expected);

        return signatureHeader.Split(',')
            .Select(part => part.Trim())
            .Where(part => part.StartsWith("v1=", StringComparison.Ordinal))
            .Select(part => Encoding.UTF8.GetBytes(part["v1=".Length..]))
            .Any(candidate => candidate.Length == expectedBytes.Length && CryptographicOperations.FixedTimeEquals(candidate, expectedBytes));
    }
}
