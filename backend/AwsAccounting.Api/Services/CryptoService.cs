using System.Security.Cryptography;
using System.Text;

namespace AwsAccounting.Api.Services;

/// <summary>AES-256-GCM for AI provider keys. Layout: base64( iv[12] · tag[16] · ciphertext ).</summary>
public class CryptoService(IConfiguration config)
{
    private byte[] Key()
    {
        var secret = config["Encryption:Key"] ?? throw new InvalidOperationException("Encryption:Key is not set");
        return SHA256.HashData(Encoding.UTF8.GetBytes(secret));
    }

    public string Encrypt(string plain)
    {
        var iv = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var pt = Encoding.UTF8.GetBytes(plain);
        var ct = new byte[pt.Length];
        using var gcm = new AesGcm(Key(), 16);
        gcm.Encrypt(iv, pt, ct, tag);
        var outb = new byte[12 + 16 + ct.Length];
        iv.CopyTo(outb, 0);
        tag.CopyTo(outb, 12);
        ct.CopyTo(outb, 28);
        return Convert.ToBase64String(outb);
    }

    public string Decrypt(string payload)
    {
        var b = Convert.FromBase64String(payload);
        var iv = b[..12];
        var tag = b[12..28];
        var ct = b[28..];
        var pt = new byte[ct.Length];
        using var gcm = new AesGcm(Key(), 16);
        gcm.Decrypt(iv, ct, tag, pt);
        return Encoding.UTF8.GetString(pt);
    }

    public string? Hint(string? payload)
    {
        if (string.IsNullOrEmpty(payload)) return null;
        try { var p = Decrypt(payload); return "••••" + p[^Math.Min(4, p.Length)..]; }
        catch { return "••••????"; }
    }
}
