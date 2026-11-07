using MartonToolBox.Application.Ai;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// Daily AI token allowances. Every licensed user has the Basic allowance (AiQuota:BasicDailyTokens); packs bought
/// through checkout (AiQuota:Packs) raise it for a number of days.
/// </summary>
public sealed class AiQuotaService(AppDbContext db, IConfiguration config, TimeProvider clock) : IAiQuotaService
{
    public int BasicDailyTokens => Math.Max(1, config.GetValue<int?>("AiQuota:BasicDailyTokens") ?? 25_000);

    public IReadOnlyList<AiPackOption> Packs => PacksFrom(config);

    public static IReadOnlyList<AiPackOption> PacksFrom(IConfiguration config)
    {
        var currency = config["AiQuota:Currency"] is { Length: > 0 } c ? c : "RON";
        var configured = config.GetSection("AiQuota:Packs").GetChildren()
            .Select(s => new AiPackOption(s["Id"] ?? string.Empty, s["Name"] ?? s["Id"] ?? string.Empty,
                s.GetValue<int>("DailyTokens"), s.GetValue<int?>("Days") ?? 30, s.GetValue<decimal>("Price"), currency))
            .Where(p => p.Id.Length > 0 && p.DailyTokens > 0 && p.Days > 0 && p.Price > 0)
            .ToList();
        return configured.Count > 0 ? configured :
        [
            new("plus", "Plus", 125_000, 30, 19m, currency),
            new("pro", "Pro", 500_000, 30, 49m, currency),
        ];
    }

    public async Task<AiQuota> GetAsync(Guid userId, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        var since = now - AiQuotaRules.Window;
        var usage = await db.AiUsages.Where(u => u.UserId == userId && u.CreatedAt > since).Select(u => new AiUsageEntry(u.CreatedAt, u.Tokens)).ToListAsync(ct);
        var grants = await db.AiPackGrants.Where(g => g.UserId == userId && g.StartsAt != null && g.ExpiresAt > now).ToListAsync(ct);
        return AiQuotaRules.Compute(now, BasicDailyTokens, usage, grants);
    }

    public async Task RecordAsync(Guid userId, int tokens, CancellationToken ct = default)
    {
        db.AiUsages.Add(new AiUsage { UserId = userId, CreatedAt = clock.GetUtcNow(), Tokens = Math.Max(1, tokens) });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Turns on the pack bought with a paid order. Safe to call more than once; the caller saves.</summary>
    public static async Task<bool> ActivatePackAsync(AppDbContext db, Order order, DateTimeOffset now, CancellationToken ct)
    {
        var grant = await db.AiPackGrants.FirstOrDefaultAsync(g => g.OrderId == order.Id, ct);
        if (grant is null || grant.StartsAt is not null) return false;
        var others = await db.AiPackGrants.Where(g => g.UserId == grant.UserId && g.Pack == grant.Pack && g.StartsAt != null).ToListAsync(ct);
        AiQuotaRules.Activate(grant, now, others);
        return true;
    }
}
