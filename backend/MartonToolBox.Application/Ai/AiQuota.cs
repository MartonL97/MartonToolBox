using MartonToolBox.Domain.Entities;

namespace MartonToolBox.Application.Ai;

/// <summary>A pack a user can buy: DailyTokens per rolling 24 hours, for Days days.</summary>
public sealed record AiPackOption(string Id, string Name, int DailyTokens, int Days, decimal Price, string Currency);

/// <summary>
/// The user's AI allowance right now, in tokens (prompt + reply, as the model counts them). Users only ever see it as a
/// percentage. Used covers the last 24 hours (a rolling window, not a midnight reset). NextFreeAt is when the oldest
/// counted use drops out, or, once the limit is reached, when enough has dropped out to chat again. PlanExpiresAt is
/// when a bought pack (including packs queued after it) runs out.
/// </summary>
public sealed record AiQuota(int Used, int Limit, string Plan, string PlanName, DateTimeOffset? PlanExpiresAt, DateTimeOffset? NextFreeAt)
{
    public bool LimitReached => Used >= Limit;

    /// <summary>0–100, rounded up so any use shows, and 100 only once the limit is actually reached.</summary>
    public int PercentUsed => LimitReached ? 100 : Used <= 0 ? 0 : Math.Clamp((int)Math.Ceiling(Used * 100.0 / Limit), 1, 99);
}

public sealed record AiUsageEntry(DateTimeOffset At, int Tokens);

/// <summary>Filled in by the chat service with what the model reports at the end of a reply.</summary>
public sealed class ChatUsageMeter
{
    public int? PromptTokens { get; set; }
    public int? CompletionTokens { get; set; }
    public bool Reported => PromptTokens is not null || CompletionTokens is not null;
    public int Total => (PromptTokens ?? 0) + (CompletionTokens ?? 0);
}

public interface IAiQuotaService
{
    int BasicDailyTokens { get; }
    IReadOnlyList<AiPackOption> Packs { get; }
    Task<AiQuota> GetAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Counts the tokens of one answered message against the user's allowance.</summary>
    Task RecordAsync(Guid userId, int tokens, CancellationToken cancellationToken = default);
}

public static class AiQuotaRules
{
    public const string BasicPlan = "basic";
    public static readonly TimeSpan Window = TimeSpan.FromHours(24);

    /// <summary>Rough count for a reply the model never reported on (e.g. stopped half way): about 4 characters per token.</summary>
    public static int EstimateTokens(int characters) => (int)Math.Ceiling(Math.Max(0, characters) / 4.0);

    /// <param name="usage">Uses inside the window, any order.</param>
    /// <param name="grants">The user's activated packs that haven't expired.</param>
    public static AiQuota Compute(DateTimeOffset now, int basicLimit, IReadOnlyList<AiUsageEntry> usage, IReadOnlyList<AiPackGrant> grants)
    {
        var active = grants
            .Where(g => g.StartsAt <= now && g.ExpiresAt > now && g.DailyTokens > basicLimit)
            .OrderByDescending(g => g.DailyTokens).FirstOrDefault();
        var limit = active?.DailyTokens ?? basicLimit;
        // Back-to-back packs of the same kind read as one longer pack.
        var expires = active is null ? null : grants.Where(g => g.Pack == active.Pack && g.StartsAt != null).Max(g => g.ExpiresAt);

        var sorted = usage.Where(u => u.At > now - Window).OrderBy(u => u.At).ToList();
        var used = sorted.Sum(u => u.Tokens);
        DateTimeOffset? nextFree = null;
        if (used < limit)
        {
            if (sorted.Count > 0) nextFree = sorted[0].At + Window;
        }
        else
        {
            // Chatting is allowed again once enough of the oldest use has aged out to get back under the limit.
            var left = used;
            foreach (var u in sorted)
            {
                left -= u.Tokens;
                if (left < limit) { nextFree = u.At + Window; break; }
            }
        }

        return new AiQuota(used, limit, active?.Pack ?? BasicPlan, active?.PackName ?? "Basic", expires, nextFree);
    }

    /// <summary>A pack bought while the same pack is still running starts when the current one ends.</summary>
    public static void Activate(AiPackGrant grant, DateTimeOffset now, IEnumerable<AiPackGrant> sameUserGrants)
    {
        if (grant.StartsAt is not null) return;
        var queuedUntil = sameUserGrants
            .Where(g => g.Id != grant.Id && g.Pack == grant.Pack && g.ExpiresAt > now)
            .Max(g => g.ExpiresAt);
        grant.StartsAt = queuedUntil ?? now;
        grant.ExpiresAt = grant.StartsAt.Value.AddDays(grant.Days);
    }
}
