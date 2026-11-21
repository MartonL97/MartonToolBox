using System.Net;
using System.Text;
using MartonToolBox.Application.Ai;
using MartonToolBox.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class SearxngSearchServiceTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add(request);
            return Task.FromResult(respond(request));
        }
    }

    private static (SearxngSearchService Service, FakeHandler Handler) Create(Func<HttpRequestMessage, HttpResponseMessage> respond, string baseUrl = "http://search.test")
    {
        var handler = new FakeHandler(respond);
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://search.test/") };
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Search:BaseUrl"] = baseUrl }).Build();
        return (new SearxngSearchService(http, config, NullLogger<SearxngSearchService>.Instance), handler);
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Returns_the_top_web_results_and_skips_bad_ones()
    {
        var (service, handler) = Create(_ => Json("""
            {"results":[
              {"title":"Weather  Cluj","url":"https://meteo.example/cluj","content":"7 °C,\n cloudy"},
              {"title":"Same page again","url":"https://meteo.example/cluj","content":"dup"},
              {"title":"","url":"https://no-title.example","content":"x"},
              {"title":"Script","url":"javascript:alert(1)","content":"x"},
              {"title":"Second","url":"http://two.example","content":null},
              {"title":"Third","url":"https://three.example","content":"c"}
            ]}
            """));

        var results = await service.SearchAsync("weather   in Cluj", 2);

        Assert.Equal(
            [new WebResult("Weather Cluj", "https://meteo.example/cluj", "7 °C, cloudy"), new WebResult("Second", "http://two.example", "")],
            results);
        var url = handler.Requests[0].RequestUri!.AbsoluteUri;
        Assert.Contains("q=weather%20in%20Cluj", url);
        Assert.Contains("format=json", url);
    }

    [Fact]
    public async Task Returns_nothing_when_search_is_off_or_down()
    {
        var (off, offHandler) = Create(_ => Json("{}"), baseUrl: "");
        Assert.False(off.Enabled);
        Assert.Empty(await off.SearchAsync("news", 5));
        Assert.Empty(offHandler.Requests);

        var (forbidden, _) = Create(_ => Json("{}", HttpStatusCode.Forbidden));
        Assert.Empty(await forbidden.SearchAsync("news", 5));

        var (down, _) = Create(_ => throw new HttpRequestException("refused"));
        Assert.Empty(await down.SearchAsync("news", 5));
    }

    [Fact]
    public void Builds_a_numbered_prompt_and_the_sources_header()
    {
        var results = new[] { new WebResult("Știri", "https://a.example", "text a"), new WebResult("B", "https://b.example", "text b") };

        var prompt = WebSearchPrompt.Build(results);
        Assert.Contains("[1] Știri\nhttps://a.example\ntext a", prompt);
        Assert.Contains("[2] B\nhttps://b.example\ntext b", prompt);
        Assert.Contains("found nothing", WebSearchPrompt.Build([]));

        using var json = System.Text.Json.JsonDocument.Parse(Convert.FromBase64String(WebSearchPrompt.EncodeSources(results)));
        Assert.Equal(2, json.RootElement.GetArrayLength());
        Assert.Equal("Știri", json.RootElement[0].GetProperty("title").GetString());
        Assert.Equal("https://b.example", json.RootElement[1].GetProperty("url").GetString());
    }
}
