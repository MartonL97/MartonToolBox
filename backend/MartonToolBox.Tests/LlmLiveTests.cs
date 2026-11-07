using System.Text;
using MartonToolBox.Application.Ai;
using MartonToolBox.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MartonToolBox.Tests;

/// <summary>
/// Runs against the real model only when LLM_LIVE_TEST=1 (start it first: docker compose up -d llm), like the LibreOffice tests.
/// </summary>
public sealed class LlmLiveTests
{
    [Fact]
    public async Task Real_model_answers_without_leaking_its_reasoning()
    {
        if (Environment.GetEnvironmentVariable("LLM_LIVE_TEST") != "1") return;
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Llm:Model"] = OpenAiChatService.DefaultModel,
            ["Llm:Think"] = "false",
        }).Build();
        var http = new HttpClient { BaseAddress = new Uri(Environment.GetEnvironmentVariable("LLM_BASE_URL") ?? "http://localhost:8081/"), Timeout = TimeSpan.FromMinutes(5) };
        var service = new OpenAiChatService(http, config, NullLogger<OpenAiChatService>.Instance);

        var status = await service.GetStatusAsync();
        Assert.True(status.Available, status.Problem);
        var reply = new StringBuilder();
        await foreach (var part in service.StreamReplyAsync([new ChatMessage("user", "Reply with exactly the word: pong")])) reply.Append(part);

        Assert.Contains("pong", reply.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("think>", reply.ToString());
        Assert.True(reply.Length < 200, "Reasoning leaked into the reply: " + reply);
    }
}
