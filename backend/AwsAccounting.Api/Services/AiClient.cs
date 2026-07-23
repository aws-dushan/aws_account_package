using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using AwsAccounting.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Services;

/// <summary>Thrown when no active AI provider is configured for a purpose; callers skip gracefully.</summary>
public sealed class AiNotConfiguredException(string purpose)
    : Exception($"AI is not configured for \"{purpose}\". Set it up in Admin → AI Settings.")
{
    public string Purpose { get; } = purpose;
}

/// <summary>
/// Provider-agnostic single-turn AI access (Claude / OpenAI / Google / Azure), reading the
/// encrypted per-purpose settings. Ported from the TS <c>lib/ai.ts</c>. Used by AI match-rescue,
/// commentary, mapping identification (P3) and PDF vision extraction (P4).
/// </summary>
public sealed class AiClient(AppDbContext db, CryptoService crypto, IHttpClientFactory httpFactory)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record Config(string Provider, string Model, string Key, string? BaseUrl, double Temperature);

    private async Task<Config> LoadAsync(string purpose, CancellationToken ct)
    {
        var row = await db.AiSettings.AsNoTracking().FirstOrDefaultAsync(a => a.Purpose == purpose, ct);
        if (row is null || !row.IsActive || string.IsNullOrEmpty(row.ApiKeyEnc)) throw new AiNotConfiguredException(purpose);
        return new Config(row.Provider, row.Model, crypto.Decrypt(row.ApiKeyEnc), row.BaseUrl,
            row.Temperature.HasValue ? (double)row.Temperature.Value : 0.1);
    }

    /// <summary>Provider-agnostic completion. Returns the model's text output.</summary>
    public async Task<string> CompleteAsync(string system, string user, int maxTokens = 1024, string purpose = "reasoning", CancellationToken ct = default)
    {
        var cfg = await LoadAsync(purpose, ct);
        var http = httpFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(30);

        if (cfg.Provider == "anthropic")
        {
            var body = new { model = cfg.Model, max_tokens = maxTokens, temperature = cfg.Temperature, system, messages = new[] { new { role = "user", content = user } } };
            using var m = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages") { Content = JsonBody(body) };
            m.Headers.Add("x-api-key", cfg.Key);
            m.Headers.Add("anthropic-version", "2023-06-01");
            var j = await SendJson(http, m, "Anthropic", ct);
            return string.Concat(j.RootElement.GetProperty("content").EnumerateArray()
                .Select(c => c.TryGetProperty("text", out var t) ? t.GetString() ?? "" : ""));
        }

        if (cfg.Provider == "google")
        {
            var body = new
            {
                systemInstruction = new { parts = new[] { new { text = system } } },
                contents = new[] { new { parts = new[] { new { text = user } } } },
                generationConfig = new { temperature = cfg.Temperature },
            };
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{cfg.Model}:generateContent?key={Uri.EscapeDataString(cfg.Key)}";
            using var m = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonBody(body) };
            var j = await SendJson(http, m, "Google", ct);
            return string.Concat(j.RootElement.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts").EnumerateArray()
                .Select(p => p.TryGetProperty("text", out var t) ? t.GetString() ?? "" : ""));
        }

        // openai / azure (OpenAI-compatible chat completions)
        var isAzure = cfg.Provider == "azure";
        var chatUrl = isAzure
            ? $"{(cfg.BaseUrl ?? "").TrimEnd('/')}/openai/deployments/{cfg.Model}/chat/completions?api-version=2024-06-01"
            : "https://api.openai.com/v1/chat/completions";
        var chatBody = new { model = cfg.Model, temperature = cfg.Temperature, messages = new[] { new { role = "system", content = system }, new { role = "user", content = user } } };
        using (var m = new HttpRequestMessage(HttpMethod.Post, chatUrl) { Content = JsonBody(chatBody) })
        {
            if (isAzure) m.Headers.Add("api-key", cfg.Key);
            else m.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.Key);
            var j = await SendJson(http, m, cfg.Provider, ct);
            return j.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
        }
    }

    /// <summary>Ask the model for JSON and deserialize it (tolerates ```json fences).</summary>
    public async Task<T?> JsonAsync<T>(string system, string user, int maxTokens = 1024, string purpose = "reasoning", CancellationToken ct = default)
    {
        var text = await CompleteAsync(system, user, maxTokens, purpose, ct);
        return JsonSerializer.Deserialize<T>(ExtractJson(text), Json);
    }

    /// <summary>Vision tier (P4): extract a ledger table from a PDF as a grid (first row = headers).</summary>
    public async Task<List<string[]>> ExtractPdfTableAsync(byte[] buf, CancellationToken ct = default)
    {
        var cfg = await LoadAsync("vision", ct);
        var b64 = Convert.ToBase64String(buf);
        const string prompt =
            "Extract the ledger table from this document. Return JSON ONLY as " +
            "{\"rows\":[[\"Header1\",\"Header2\",...],[\"cell\",\"cell\",...], ...]} — the first row is the " +
            "column headers; preserve every data row and column. No commentary.";

        var http = httpFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(60);
        string text;

        if (cfg.Provider == "anthropic")
        {
            var body = new
            {
                model = cfg.Model,
                max_tokens = 4096,
                messages = new[] { new { role = "user", content = new object[]
                {
                    new { type = "document", source = new { type = "base64", media_type = "application/pdf", data = b64 } },
                    new { type = "text", text = prompt },
                } } },
            };
            using var m = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages") { Content = JsonBody(body) };
            m.Headers.Add("x-api-key", cfg.Key);
            m.Headers.Add("anthropic-version", "2023-06-01");
            var j = await SendJson(http, m, "Anthropic", ct);
            text = string.Concat(j.RootElement.GetProperty("content").EnumerateArray()
                .Select(c => c.TryGetProperty("text", out var t) ? t.GetString() ?? "" : ""));
        }
        else if (cfg.Provider == "google")
        {
            var body = new { contents = new[] { new { parts = new object[]
            {
                new { inlineData = new { mimeType = "application/pdf", data = b64 } },
                new { text = prompt },
            } } } };
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{cfg.Model}:generateContent?key={Uri.EscapeDataString(cfg.Key)}";
            using var m = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonBody(body) };
            var j = await SendJson(http, m, "Google", ct);
            text = string.Concat(j.RootElement.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts").EnumerateArray()
                .Select(p => p.TryGetProperty("text", out var t) ? t.GetString() ?? "" : ""));
        }
        else
        {
            throw new InvalidOperationException("PDF vision requires an Anthropic or Google provider for the vision purpose.");
        }

        using var doc = JsonDocument.Parse(ExtractJson(text));
        if (!doc.RootElement.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) return [];
        return rows.EnumerateArray()
            .Select(r => r.ValueKind == JsonValueKind.Array
                ? r.EnumerateArray().Select(c => c.ValueKind == JsonValueKind.String ? c.GetString() ?? "" : c.ToString()).ToArray()
                : Array.Empty<string>())
            .ToList();
    }

    private static StringContent JsonBody(object body)
        => new(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");

    private static async Task<JsonDocument> SendJson(HttpClient http, HttpRequestMessage m, string provider, CancellationToken ct)
    {
        var res = await http.SendAsync(m, ct);
        if (!res.IsSuccessStatusCode) throw new HttpRequestException($"{provider} HTTP {(int)res.StatusCode}");
        return await JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
    }

    /// <summary>Strip ```json fences and isolate the outermost {...} object.</summary>
    private static string ExtractJson(string text)
    {
        var cleaned = text.Trim();
        if (cleaned.StartsWith("```"))
        {
            int nl = cleaned.IndexOf('\n');
            if (nl >= 0) cleaned = cleaned[(nl + 1)..];
            if (cleaned.EndsWith("```")) cleaned = cleaned[..^3];
            cleaned = cleaned.Trim();
        }
        int start = cleaned.IndexOf('{');
        int end = cleaned.LastIndexOf('}');
        return start >= 0 && end > start ? cleaned[start..(end + 1)] : cleaned;
    }
}
