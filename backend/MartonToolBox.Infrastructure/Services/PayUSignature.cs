using System.Security.Cryptography;
using System.Text;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// PayU's notification signature: the OpenPayu-Signature header looks like
/// "sender=checkout;signature=...;algorithm=MD5;content=DOCUMENT", where signature is
/// hex(hash(rawBody + secondKey)) using the named algorithm (MD5 or SHA-256).
/// </summary>
public static class PayUSignature
{
    public static bool Verify(string? header, string rawBody, string secondKey)
    {
        if (string.IsNullOrEmpty(header) || string.IsNullOrEmpty(secondKey)) return false;

        var parts = header.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Split('=', 2))
            .Where(p => p.Length == 2)
            .ToDictionary(p => p[0].Trim(), p => p[1].Trim(), StringComparer.OrdinalIgnoreCase);
        if (!parts.TryGetValue("signature", out var received) || string.IsNullOrEmpty(received)) return false;

        var input = Encoding.UTF8.GetBytes(rawBody + secondKey);
        byte[]? hash = parts.GetValueOrDefault("algorithm")?.ToUpperInvariant() switch
        {
            null or "MD5" => MD5.HashData(input),
            "SHA256" or "SHA-256" => SHA256.HashData(input),
            _ => null
        };
        if (hash is null) return false;

        var a = Encoding.UTF8.GetBytes(received.ToLowerInvariant());
        var b = Encoding.UTF8.GetBytes(Convert.ToHexString(hash).ToLowerInvariant());
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}
