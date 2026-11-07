using System.Net;
using System.Text;
using System.Text.Json;
using MartonToolBox.Application.Ai;
using MartonToolBox.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class OpenAiChatServiceTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string? Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add((request, request.Content is null ? null : await request.Content.ReadAsStringAsync(ct)));
            return respond(request);
        }
    }

    private static (OpenAiChatService Service, FakeHandler Handler) Create(Func<HttpRequestMessage, HttpResponseMessage> respond, Dictionary<string, string?>? settings = null)
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://llm.test/") };
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings ?? new() { ["Llm:Model"] = "qwen3-4b", ["Llm:Think"] = "false" }).Build();
        return (new OpenAiChatService(http, config, NullLogger<OpenAiChatService>.Instance), handler);
    }

    /// <summary>A streamed reply as server-sent events, one delta per fragment.</summary>
    private static HttpResponseMessage Sse(params string?[] fragments)
    {
        var sb = new StringBuilder();
        foreach (var f in fragments)
            sb.Append("data: ").Append(JsonSerializer.Serialize(new { choices = new[] { new { delta = new { content = f } } } })).Append("\n\n");
        sb.Append("data: [DONE]\n\n");
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(sb.ToString(), Encoding.UTF8, "text/event-stream") };
    }

    private static HttpResponseMessage JsonBody(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static async Task<string> Collect(IAsyncEnumerable<string> parts)
    {
        var sb = new StringBuilder();
        await foreach (var p in parts) sb.Append(p);
        return sb.ToString();
    }

    private static readonly ChatMessage[] Hello = [new("user", "Hello")];

    [Fact]
    public async Task Streams_the_reply_and_sends_model_system_prompt_and_thinking_switch()
    {
        var (service, handler) = Create(_ => Sse("Hi", " there", "!", null));

        Assert.Equal("Hi there!", await Collect(service.StreamReplyAsync(Hello)));

        var (request, body) = Assert.Single(handler.Requests);
        Assert.Equal("http://llm.test/v1/chat/completions", request.RequestUri!.ToString());
        using var json = JsonDocument.Parse(body!);
        Assert.Equal("qwen3-4b", json.RootElement.GetProperty("model").GetString());
        Assert.True(json.RootElement.GetProperty("stream").GetBoolean());
        Assert.True(json.RootElement.GetProperty("stream_options").GetProperty("include_usage").GetBoolean());
        Assert.False(json.RootElement.GetProperty("chat_template_kwargs").GetProperty("enable_thinking").GetBoolean());
        var messages = json.RootElement.GetProperty("messages");
        Assert.Equal("system", messages[0].GetProperty("role").GetString());
        Assert.Equal("Hello", messages[1].GetProperty("content").GetString());
    }

    [Fact]
    public async Task Reports_the_token_counts_from_the_last_chunk()
    {
        var events =
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n" +
            "data: {\"choices\":[],\"usage\":{\"completion_tokens\":13,\"prompt_tokens\":14,\"total_tokens\":27}}\n\n" +
            "data: [DONE]\n\n";
        var (service, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(events, Encoding.UTF8, "text/event-stream") });
        var meter = new ChatUsageMeter();

        Assert.Equal("Hi", await Collect(service.StreamReplyAsync(Hello, meter)));
        Assert.True(meter.Reported);
        Assert.Equal(14, meter.PromptTokens);
        Assert.Equal(13, meter.CompletionTokens);
        Assert.Equal(27, meter.Total);
    }

    [Fact]
    public async Task Leaves_out_the_thinking_switch_when_not_configured()
    {
        var (service, handler) = Create(_ => Sse("ok"), new() { ["Llm:Model"] = "llama-3.2-3b" });
        await Collect(service.StreamReplyAsync(Hello));
        using var json = JsonDocument.Parse(handler.Requests[0].Body!);
        Assert.False(json.RootElement.TryGetProperty("chat_template_kwargs", out _));
    }

    [Fact]
    public async Task Ignores_reasoning_content_and_hides_inline_think_tags()
    {
        var events =
            "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"Let me think...\"}}]}\n\n" +
            "data: {\"choices\":[{\"delta\":{\"content\":\"<thi\"}}]}\n\n" +
            "data: {\"choices\":[{\"delta\":{\"content\":\"nk>plan</think>\\n\\nThe answer\"}}]}\n\n" +
            "data: {\"choices\":[{\"delta\":{\"content\":\" is 42.\"}}]}\n\n" +
            "data: [DONE]\n\n";
        var (service, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(events, Encoding.UTF8, "text/event-stream") });

        Assert.Equal("The answer is 42.", await Collect(service.StreamReplyAsync(Hello)));
    }

    [Fact]
    public async Task Reports_an_unreachable_server_as_unavailable()
    {
        var (service, _) = Create(_ => throw new HttpRequestException("Connection refused"));
        var ex = await Assert.ThrowsAsync<ChatUnavailableException>(() => Collect(service.StreamReplyAsync(Hello)));
        Assert.Contains("docker compose up -d llm", ex.Message);

        var status = await service.GetStatusAsync();
        Assert.False(status.Available);
        Assert.Contains("isn't running", status.Problem);
    }

    [Fact]
    public async Task Reports_a_model_that_is_still_loading()
    {
        var (service, _) = Create(_ => JsonBody(HttpStatusCode.ServiceUnavailable, "{\"error\":{\"message\":\"Loading model\"}}"));
        var ex = await Assert.ThrowsAsync<ChatUnavailableException>(() => Collect(service.StreamReplyAsync(Hello)));
        Assert.Contains("still starting", ex.Message);
        Assert.Contains("still starting", (await service.GetStatusAsync()).Problem);
    }

    [Fact]
    public async Task Explains_a_rejected_api_key()
    {
        var (service, _) = Create(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized));
        var ex = await Assert.ThrowsAsync<ChatUnavailableException>(() => Collect(service.StreamReplyAsync(Hello)));
        Assert.Contains("API key", ex.Message);
        Assert.Contains("API key", (await service.GetStatusAsync()).Problem);
    }

    [Fact]
    public async Task Status_reports_the_served_model()
    {
        var (service, handler) = Create(_ => JsonBody(HttpStatusCode.OK, "{\"object\":\"list\",\"data\":[{\"id\":\"qwen3-4b\",\"object\":\"model\"}]}"));
        Assert.Equal(new ChatStatus(true, "qwen3-4b", null), await service.GetStatusAsync());
        Assert.Equal("http://llm.test/v1/models", handler.Requests[0].Request.RequestUri!.ToString());

        // A server that names its model differently still counts as ready; the status shows the real name.
        var (other, _) = Create(_ => JsonBody(HttpStatusCode.OK, "{\"data\":[{\"id\":\"Qwen3-4B-Q4_K_M.gguf\"}]}"));
        Assert.Equal(new ChatStatus(true, "Qwen3-4B-Q4_K_M.gguf", null), await other.GetStatusAsync());
    }

    [Fact]
    public void Think_filter_keeps_text_that_only_looks_like_a_tag()
    {
        var filter = new ThinkTagFilter();
        Assert.Equal("a ", filter.Push("a <"));
        Assert.Equal("<b> c", filter.Push("b> c"));
        Assert.Equal("", filter.Push("<thin"));
        Assert.Equal("<thin", filter.Flush());
    }
}
