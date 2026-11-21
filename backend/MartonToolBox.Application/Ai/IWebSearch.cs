using System.Text;
using System.Text.Json;

namespace MartonToolBox.Application.Ai;

/// <summary>One web search hit: the page title, its address and a short text from it.</summary>
public sealed record WebResult(string Title, string Url, string Snippet);

/// <summary>Searches the web so the AI Assistant can answer about current things (news, prices, weather, events).</summary>
public interface IWebSearch
{
    /// <summary>False when no search server is configured; the chat then works without web search.</summary>
    bool Enabled { get; }

    /// <summary>The top results, or none when the search server is down (the chat goes on without them).</summary>
    Task<IReadOnlyList<WebResult>> SearchAsync(string query, int count, CancellationToken cancellationToken = default);
}

public static class WebSearchPrompt
{
    public const int ResultCount = 5;
    public const int MaxQueryChars = 300;

    /// <summary>The text added to the system prompt, so the model answers from the results and cites them as [1], [2]….</summary>
    public static string Build(IReadOnlyList<WebResult> results)
    {
        if (results.Count == 0)
            return "A web search for the user's latest message found nothing. If the question needs current information, " +
                   "say that you couldn't find it online instead of guessing.";

        var sb = new StringBuilder(
            "Web search results for the user's latest message, fetched just now. For current facts (news, prices, weather, " +
            "dates, events) rely on these instead of your own knowledge. Cite the sources you use as [1], [2] and so on. " +
            "If the results don't answer the question, say so.\n");
        for (var i = 0; i < results.Count; i++)
            sb.Append('\n').Append('[').Append(i + 1).Append("] ").Append(results[i].Title).Append('\n')
              .Append(results[i].Url).Append('\n').Append(results[i].Snippet).Append('\n');
        return sb.ToString();
    }

    /// <summary>
    /// The reply's sources for a response header, numbered like the model's [1], [2] citations: base64 of UTF-8 JSON
    /// [{title, url}] (base64 because titles can hold any character and headers only carry ASCII).
    /// </summary>
    public static string EncodeSources(IReadOnlyList<WebResult> sources) =>
        Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(
            sources.Select(s => new { s.Title, s.Url }), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
}
