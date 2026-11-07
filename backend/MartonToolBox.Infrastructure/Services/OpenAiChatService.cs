using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using MartonToolBox.Application.Ai;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// Talks to any OpenAI-compatible chat server (/v1/models, /v1/chat/completions). The app runs llama.cpp's llama-server
/// in Docker (see docker-compose.yml); vLLM, LM Studio or a hosted API work the same way.
/// Configured by the "Llm" section: BaseUrl (default http://localhost:8081), Model, Think, ApiKey and SystemPrompt.
/// </summary>
public sealed class OpenAiChatService(HttpClient http, IConfiguration config, ILogger<OpenAiChatService> logger) : IChatService
{
    public const string DefaultModel = "qwen3-4b";
    public const string DefaultSystemPrompt =
        "You are the MartonToolBox assistant. Help the user with everyday work: writing, summarizing, explaining, " +
        "data and spreadsheets, documents and files. Be concise and practical. Answer in the language the user writes in.";

    private const string Unreachable = "The AI model isn't running. Start it with: docker compose up -d llm";
    private const string Loading = "The AI model is still starting (the first start downloads it). Try again in a minute.";
    private const string BadKey = "The AI server rejected the API key. Check Llm:ApiKey.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    private string Model => config["Llm:Model"] is { Length: > 0 } m ? m : DefaultModel;

    public async Task<ChatStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await http.GetAsync("v1/models", cancellationToken);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) return new ChatStatus(false, Model, BadKey);
            // llama-server answers 503 while it downloads or loads the model.
            if (response.StatusCode == HttpStatusCode.ServiceUnavailable) return new ChatStatus(false, Model, Loading);
            response.EnsureSuccessStatusCode();
            var models = await response.Content.ReadFromJsonAsync<ModelList>(Json, cancellationToken);
            return models?.Data is { Count: > 0 } list
                ? new ChatStatus(true, list.Any(m => m.Id == Model) ? Model : list[0].Id, null)
                : new ChatStatus(false, Model, Loading);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            if (cancellationToken.IsCancellationRequested) throw;
            logger.LogWarning(ex, "LLM status check failed");
            return new ChatStatus(false, Model, Unreachable);
        }
    }

    public async IAsyncEnumerable<string> StreamReplyAsync(IReadOnlyList<ChatMessage> messages, ChatUsageMeter? usage = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var think = config.GetValue<bool?>("Llm:Think");
        var body = new ChatRequest(
            Model,
            [new("system", config["Llm:SystemPrompt"] is { Length: > 0 } p ? p : DefaultSystemPrompt), .. messages.Select(m => new WireMessage(m.Role, m.Content))],
            Stream: true,
            // Ask for token counts in a last chunk (prompt + reply); the daily allowance is measured in tokens.
            StreamOptions: new StreamOptions(IncludeUsage: true),
            // Qwen3-style models reason before answering unless told not to; off by default so replies start right away.
            // The reasoning never reaches the user either way (it arrives as reasoning_content, which is ignored).
            ChatTemplateKwargs: think is null ? null : new Dictionary<string, object> { ["enable_thinking"] = think.Value });

        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/chat/completions") { Content = JsonContent.Create(body, options: Json) };
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException || (ex is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            logger.LogWarning(ex, "LLM chat request failed");
            throw new ChatUnavailableException(Unreachable, ex);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("LLM server returned {Status}: {Body}", (int)response.StatusCode, await SafeReadAsync(response, cancellationToken));
                throw new ChatUnavailableException(response.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => BadKey,
                    HttpStatusCode.ServiceUnavailable => Loading,
                    _ => "The AI model couldn't answer. Please try again.",
                });
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = new StreamReader(stream);
            var filter = new ThinkTagFilter();
            var started = false;
            // Server-sent events: "data: {json}" lines, ending with "data: [DONE]".
            while (await reader.ReadLineAsync(cancellationToken) is { } line)
            {
                if (!line.StartsWith("data:", StringComparison.Ordinal)) continue;
                var data = line[5..].Trim();
                if (data == "[DONE]") break;
                var chunk = JsonSerializer.Deserialize<ChatChunk>(data, Json);
                if (chunk?.Error is { } err)
                {
                    logger.LogWarning("LLM stream error: {Error}", err.Message);
                    throw new ChatUnavailableException("The AI model stopped unexpectedly. Please try again.");
                }
                if (chunk?.Usage is { } counts && usage is not null)
                {
                    usage.PromptTokens = counts.PromptTokens;
                    usage.CompletionTokens = counts.CompletionTokens;
                }
                var content = chunk?.Choices is { Count: > 0 } choices ? choices[0].Delta?.Content : null;
                foreach (var text in Visible(filter.Push(content ?? string.Empty))) yield return text;
            }
            foreach (var text in Visible(filter.Flush())) yield return text;

            // Drops the blank lines a model emits before its first real word (e.g. right after a think block).
            IEnumerable<string> Visible(string text)
            {
                if (!started) text = text.TrimStart();
                if (text.Length == 0) yield break;
                started = true;
                yield return text;
            }
        }
    }

    private static async Task<string> SafeReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try { var text = await response.Content.ReadAsStringAsync(ct); return text.Length > 500 ? text[..500] : text; }
        catch (Exception) { return string.Empty; }
    }

    private sealed record ChatRequest(string Model, IReadOnlyList<WireMessage> Messages, bool Stream, StreamOptions StreamOptions, Dictionary<string, object>? ChatTemplateKwargs);
    private sealed record StreamOptions(bool IncludeUsage);
    private sealed record UsageInfo(int? PromptTokens, int? CompletionTokens);
    private sealed record WireMessage(string Role, string Content);
    private sealed record ChatChunk(IReadOnlyList<Choice>? Choices, ErrorInfo? Error, UsageInfo? Usage);
    private sealed record Choice(Delta? Delta);
    private sealed record Delta(string? Content);
    private sealed record ErrorInfo(string? Message);
    private sealed record ModelList(IReadOnlyList<ModelInfo>? Data);
    private sealed record ModelInfo(string Id);
}

/// <summary>
/// Removes &lt;think&gt;…&lt;/think&gt; reasoning that some models write inline, even when a tag is split across stream chunks.
/// </summary>
public sealed class ThinkTagFilter
{
    private const string Open = "<think>", Close = "</think>";
    private string pending = string.Empty;
    private bool thinking;

    public string Push(string text)
    {
        pending += text;
        var output = new System.Text.StringBuilder();
        while (true)
        {
            var tag = thinking ? Close : Open;
            var at = pending.IndexOf(tag, StringComparison.Ordinal);
            if (at >= 0)
            {
                if (!thinking) output.Append(pending, 0, at);
                pending = pending[(at + tag.Length)..];
                thinking = !thinking;
                continue;
            }
            // Hold back a trailing fragment that could be the start of the tag, until the next chunk decides.
            var keep = PartialTagLength(pending, tag);
            if (!thinking) output.Append(pending, 0, pending.Length - keep);
            pending = pending[^keep..];
            return output.ToString();
        }
    }

    /// <summary>Whatever is left at the end of the stream (an unfinished think block is dropped).</summary>
    public string Flush()
    {
        var rest = thinking ? string.Empty : pending;
        pending = string.Empty;
        return rest;
    }

    private static int PartialTagLength(string text, string tag)
    {
        for (var n = Math.Min(tag.Length - 1, text.Length); n > 0; n--)
            if (text.EndsWith(tag[..n], StringComparison.Ordinal)) return n;
        return 0;
    }
}
