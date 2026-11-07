using MartonToolBox.Application.Ai;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class AiQuotaRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 7, 12, 0, 0, TimeSpan.Zero);

    private static AiPackGrant Pack(string pack, int tokens, DateTimeOffset starts, int days = 30) =>
        new() { Pack = pack, PackName = pack == "pro" ? "Pro" : "Plus", DailyTokens = tokens, Days = days, StartsAt = starts, ExpiresAt = starts.AddDays(days) };

    private static AiUsageEntry Use(double hoursAgo, int tokens) => new(Now.AddMinutes(-hoursAgo * 60), tokens);

    [Fact]
    public void Basic_sums_the_tokens_of_the_last_24_hours()
    {
        var q = AiQuotaRules.Compute(Now, 1000, [Use(1, 100), Use(5, 150), Use(23.9, 50), Use(24.5, 900), Use(30, 900)], []);
        Assert.Equal(300, q.Used);
        Assert.Equal(1000, q.Limit);
        Assert.Equal(30, q.PercentUsed);
        Assert.False(q.LimitReached);
        Assert.Equal("basic", q.Plan);
        Assert.Equal("Basic", q.PlanName);
        Assert.Null(q.PlanExpiresAt);
        // The oldest counted use (23 h 54 min ago) frees up in 6 minutes.
        Assert.Equal(Now.AddMinutes(6), q.NextFreeAt);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)] // any use shows
    [InlineData(994, 99)]
    [InlineData(999, 99)] // 100% only once actually blocked
    [InlineData(1000, 100)]
    [InlineData(1700, 100)]
    public void Percent_used_is_shown_honestly(int used, int percent)
    {
        var q = AiQuotaRules.Compute(Now, 1000, used > 0 ? [Use(1, used)] : [], []);
        Assert.Equal(percent, q.PercentUsed);
    }

    [Fact]
    public void Reaching_the_limit_blocks_until_enough_use_ages_out()
    {
        // 1200 used of 1000: the oldest use (100, 22 h ago) alone isn't enough, the 20 h old one (600) must go too.
        var q = AiQuotaRules.Compute(Now, 1000, [Use(2, 500), Use(20, 600), Use(22, 100)], []);
        Assert.True(q.LimitReached);
        Assert.Equal(100, q.PercentUsed);
        Assert.Equal(Now.AddHours(4), q.NextFreeAt);
    }

    [Fact]
    public void No_use_means_nothing_to_free_up()
    {
        Assert.Null(AiQuotaRules.Compute(Now, 1000, [], []).NextFreeAt);
    }

    [Fact]
    public void The_biggest_running_pack_sets_the_limit()
    {
        var plus = Pack("plus", 5000, Now.AddDays(-3));
        var pro = Pack("pro", 20000, Now.AddDays(-1), days: 7);
        var q = AiQuotaRules.Compute(Now, 1000, [Use(1, 2000)], [plus, pro]);
        Assert.Equal(20000, q.Limit);
        Assert.Equal(10, q.PercentUsed);
        Assert.Equal("pro", q.Plan);
        Assert.Equal("Pro", q.PlanName);
        Assert.Equal(pro.ExpiresAt, q.PlanExpiresAt);
    }

    [Fact]
    public void A_queued_pack_extends_the_shown_end_date_but_not_before_it_starts()
    {
        var current = Pack("plus", 5000, Now.AddDays(-10));
        var queued = Pack("plus", 5000, current.ExpiresAt!.Value);
        var q = AiQuotaRules.Compute(Now, 1000, [], [current, queued]);
        Assert.Equal(5000, q.Limit);
        Assert.Equal(queued.ExpiresAt, q.PlanExpiresAt);

        var onlyQueued = AiQuotaRules.Compute(Now, 1000, [], [Pack("plus", 5000, Now.AddDays(1))]);
        Assert.Equal(1000, onlyQueued.Limit);
        Assert.Equal("basic", onlyQueued.Plan);
    }

    [Fact]
    public void Buying_the_same_pack_again_starts_when_the_current_one_ends()
    {
        var current = Pack("plus", 5000, Now.AddDays(-10));
        var again = new AiPackGrant { Pack = "plus", DailyTokens = 5000, Days = 30 };
        AiQuotaRules.Activate(again, Now, [current]);
        Assert.Equal(current.ExpiresAt, again.StartsAt);
        Assert.Equal(current.ExpiresAt!.Value.AddDays(30), again.ExpiresAt);

        var other = new AiPackGrant { Pack = "pro", DailyTokens = 20000, Days = 30 };
        AiQuotaRules.Activate(other, Now, [current]);
        Assert.Equal(Now, other.StartsAt);

        // Activating twice changes nothing.
        AiQuotaRules.Activate(other, Now.AddDays(5), [current]);
        Assert.Equal(Now, other.StartsAt);
    }

    [Fact]
    public void Estimates_about_four_characters_per_token()
    {
        Assert.Equal(0, AiQuotaRules.EstimateTokens(0));
        Assert.Equal(1, AiQuotaRules.EstimateTokens(3));
        Assert.Equal(250, AiQuotaRules.EstimateTokens(1000));
    }

    [Fact]
    public void Packs_come_from_settings_with_defaults()
    {
        var empty = new ConfigurationBuilder().Build();
        Assert.Equal(["plus", "pro"], AiQuotaService.PacksFrom(empty).Select(p => p.Id));

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AiQuota:Currency"] = "EUR",
            ["AiQuota:Packs:0:Id"] = "mega",
            ["AiQuota:Packs:0:Name"] = "Mega",
            ["AiQuota:Packs:0:DailyTokens"] = "1000000",
            ["AiQuota:Packs:0:Price"] = "99.5",
            ["AiQuota:Packs:1:Id"] = "broken", // no price: ignored
        }).Build();
        Assert.Equal([new AiPackOption("mega", "Mega", 1_000_000, 30, 99.5m, "EUR")], AiQuotaService.PacksFrom(config));
    }
}
