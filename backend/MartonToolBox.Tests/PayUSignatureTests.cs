using System.Security.Cryptography;
using System.Text;
using MartonToolBox.Infrastructure.Services;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class PayUSignatureTests
{
    private const string Key = "b6ca15b0d1020e8094d9b5f8d163db54";
    private const string Body = """{"order":{"orderId":"ABC123","status":"COMPLETED"}}""";

    private static string Hex(byte[] hash) => Convert.ToHexString(hash).ToLowerInvariant();

    [Fact]
    public void Accepts_valid_md5_signature()
    {
        var sig = Hex(MD5.HashData(Encoding.UTF8.GetBytes(Body + Key)));
        Assert.True(PayUSignature.Verify($"sender=checkout;signature={sig};algorithm=MD5;content=DOCUMENT", Body, Key));
    }

    [Fact]
    public void Accepts_valid_sha256_signature()
    {
        var sig = Hex(SHA256.HashData(Encoding.UTF8.GetBytes(Body + Key)));
        Assert.True(PayUSignature.Verify($"sender=checkout;signature={sig};algorithm=SHA-256;content=DOCUMENT", Body, Key));
    }

    [Fact]
    public void Rejects_tampered_body_missing_header_and_unknown_algorithm()
    {
        var sig = Hex(MD5.HashData(Encoding.UTF8.GetBytes(Body + Key)));
        Assert.False(PayUSignature.Verify($"signature={sig};algorithm=MD5", Body.Replace("COMPLETED", "CANCELED"), Key));
        Assert.False(PayUSignature.Verify(null, Body, Key));
        Assert.False(PayUSignature.Verify($"signature={sig};algorithm=SHA1", Body, Key));
    }
}
