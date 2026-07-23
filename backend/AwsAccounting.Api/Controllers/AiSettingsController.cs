using AwsAccounting.Api.Data;
using AwsAccounting.Api.Domain;
using AwsAccounting.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/ai-settings")]
[Authorize(Policy = "SuperAdmin")]
public class AiSettingsController(AppDbContext db, CryptoService crypto, AuditService audit, IHttpClientFactory httpFactory) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var rows = await db.AiSettings.ToListAsync();
        return Ok(rows.Select(r => new { r.Purpose, r.Provider, r.Model, r.BaseUrl, r.Temperature, r.IsActive, keyHint = crypto.Hint(r.ApiKeyEnc) }));
    }

    public record SaveReq(string Purpose, string Provider, string Model, string? ApiKey, string? BaseUrl, decimal? Temperature, bool IsActive);

    [HttpPut]
    public async Task<IActionResult> Save([FromBody] SaveReq req)
    {
        if (req.Purpose is not ("reasoning" or "vision")) return BadRequest(new { error = "Invalid purpose." });
        if (!IsProvider(req.Provider)) return BadRequest(new { error = "Select a provider." });
        if (string.IsNullOrWhiteSpace(req.Model)) return BadRequest(new { error = "Enter a model name." });
        if (req.Provider == "azure" && string.IsNullOrWhiteSpace(req.BaseUrl)) return BadRequest(new { error = "Azure requires an endpoint (base URL)." });

        var row = await db.AiSettings.FirstOrDefaultAsync(a => a.Purpose == req.Purpose);
        if (row is null) { row = new AiSetting { Purpose = req.Purpose }; db.AiSettings.Add(row); }
        row.Provider = req.Provider;
        row.Model = req.Model.Trim();
        row.BaseUrl = string.IsNullOrWhiteSpace(req.BaseUrl) ? null : req.BaseUrl.Trim();
        row.Temperature = req.Temperature;
        row.IsActive = req.IsActive;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(req.ApiKey)) row.ApiKeyEnc = crypto.Encrypt(req.ApiKey.Trim());
        await db.SaveChangesAsync();

        await audit.WriteAsync("ai.settings.save", "ai_settings", req.Purpose, null, new { req.Provider, req.Model, keyUpdated = !string.IsNullOrWhiteSpace(req.ApiKey), req.IsActive });
        return Ok(new { ok = true });
    }

    public record TestReq(string Purpose, string Provider, string Model, string? ApiKey, string? BaseUrl);

    [HttpPost("test")]
    public async Task<IActionResult> Test([FromBody] TestReq req)
    {
        var key = req.ApiKey?.Trim();
        if (string.IsNullOrEmpty(key))
        {
            var row = await db.AiSettings.FirstOrDefaultAsync(a => a.Purpose == req.Purpose);
            if (row?.ApiKeyEnc is not null)
            {
                try { key = crypto.Decrypt(row.ApiKeyEnc); }
                catch { return Ok(new { ok = false, message = "Stored key could not be decrypted." }); }
            }
        }
        if (string.IsNullOrEmpty(key)) return Ok(new { ok = false, message = "Enter an API key to test." });

        var http = httpFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(12);
        try
        {
            HttpResponseMessage res;
            switch (req.Provider)
            {
                case "openai":
                    {
                        var m = new HttpRequestMessage(HttpMethod.Get, "https://api.openai.com/v1/models");
                        m.Headers.Add("Authorization", $"Bearer {key}");
                        res = await http.SendAsync(m);
                        break;
                    }
                case "anthropic":
                    {
                        var m = new HttpRequestMessage(HttpMethod.Get, "https://api.anthropic.com/v1/models");
                        m.Headers.Add("x-api-key", key);
                        m.Headers.Add("anthropic-version", "2023-06-01");
                        res = await http.SendAsync(m);
                        break;
                    }
                case "google":
                    res = await http.GetAsync($"https://generativelanguage.googleapis.com/v1beta/models?key={Uri.EscapeDataString(key)}");
                    break;
                case "azure":
                    {
                        var b = (req.BaseUrl ?? "").TrimEnd('/');
                        if (b.Length == 0) return Ok(new { ok = false, message = "Azure endpoint (base URL) is required." });
                        var m = new HttpRequestMessage(HttpMethod.Get, $"{b}/openai/models?api-version=2024-06-01");
                        m.Headers.Add("api-key", key);
                        res = await http.SendAsync(m);
                        break;
                    }
                default:
                    return Ok(new { ok = false, message = "Unknown provider." });
            }

            if (res.IsSuccessStatusCode) return Ok(new { ok = true, message = "Connection successful — key is valid." });
            if ((int)res.StatusCode is 401 or 403) return Ok(new { ok = false, message = "Authentication failed — check the API key." });
            return Ok(new { ok = false, message = $"Provider returned HTTP {(int)res.StatusCode}." });
        }
        catch (TaskCanceledException) { return Ok(new { ok = false, message = "Request timed out." }); }
        catch { return Ok(new { ok = false, message = "Network error reaching provider." }); }
    }

    private static bool IsProvider(string p) => p is "anthropic" or "openai" or "google" or "azure";
}
