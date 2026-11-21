using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using MartonToolBox.Application.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// Web search through a self-hosted SearXNG (Docker container, see setup-searxng.ps1). Configured by Search:BaseUrl,
/// e.g. http://localhost:8888; empty turns web search off. SearXNG must allow the json format in its settings.yml.
/// </summary>
public sealed partial class SearxngSearchService(HttpClient http, IConfiguration config, ILogger<SearxngSearchService> logger) : IWebSearch
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public bool Enabled => config["Search:BaseUrl"] is { Length: > 0 };

    public async Task<IReadOnlyList<WebResult>> SearchAsync(string query, int count, CancellationToken cancellationToken = default)
    {
        query = Whitespace().Replace(query ?? string.Empty, " ").Trim();
        if (!Enabled || query.Length == 0 || count <= 0) return [];
        if (query.Length > WebSearchPrompt.MaxQueryChars) query = query[..WebSearchPrompt.MaxQueryChars];

        try
        {
            using var response = await http.GetAsync($"search?q={Uri.EscapeDataString(query)}&format=json&safesearch=1", cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                // 403 means SearXNG doesn't allow format=json (search: formats: [html, json] in settings.yml).
                logger.LogWarning("Web search returned {Status}", (int)response.StatusCode);
                return [];
            }
            var body = await response.Content.ReadFromJsonAsync<SearxResponse>(Json, cancellationToken);
            return (body?.Results ?? [])
                .Where(r => !string.IsNullOrWhiteSpace(r.Title) && IsWebAddress(r.Url))
                .DistinctBy(r => r.Url)
                .Take(count)
                .Select(r => new WebResult(Clean(r.Title, 200), r.Url!, Clean(r.Content, 500)))
                .ToList();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            if (cancellationToken.IsCancellationRequested) throw;
            logger.LogWarning(ex, "Web search failed");
            return [];
        }
    }

    private static bool IsWebAddress(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);

    private static string Clean(string? text, int max)
    {
        var s = Whitespace().Replace(text ?? string.Empty, " ").Trim();
        return s.Length <= max ? s : s[..max].TrimEnd() + "…";
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    private sealed record SearxResponse(IReadOnlyList<SearxResult>? Results);
    private sealed record SearxResult(string? Title, string? Url, string? Content);
}
