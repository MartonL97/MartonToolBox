using MartonToolBox.Application.Shipping;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using MartonToolBox.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Services;

/// <summary>
/// Refreshes unfinished orders from the courier every 12 hours (Sameday:CheckIntervalHours). Each order remembers its
/// last check, so an IIS restart doesn't reset the wait or cause extra lookups.
/// </summary>
public sealed class AwbTrackingJob(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<AwbTrackingJob> logger) : BackgroundService
{
    private static readonly TimeSpan WakeEvery = TimeSpan.FromHours(1);
    private static readonly TimeSpan PauseBetweenLookups = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(WakeEvery);
        do
        {
            try { await CheckDueOrdersAsync(stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError(ex, "AWB tracking run failed."); }
        } while (await WaitAsync(timer, stoppingToken));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try { return await timer.WaitForNextTickAsync(ct); }
        catch (OperationCanceledException) { return false; }
    }

    private async Task CheckDueOrdersAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var courier = scope.ServiceProvider.GetRequiredService<ICourierTracking>();
        var cutoff = DateTimeOffset.UtcNow - TimeSpan.FromHours(configuration.GetValue<int?>("Sameday:CheckIntervalHours") ?? 12);

        var due = await db.Orders
            .Where(o => o.Kind == OrderKinds.Shop && o.Status == "Paid" && o.TrackingNumber != null && o.DeliveredAt == null
                && (o.TrackingCheckedAt == null || o.TrackingCheckedAt <= cutoff))
            .ToListAsync(ct);

        foreach (var order in due)
        {
            var events = await courier.GetEventsAsync(order.TrackingNumber!, ct);
            if (events is not null) CourierTimeline.Apply(order, events);
            // Stamped even when the lookup failed, so a broken AWB waits for the next round.
            order.TrackingCheckedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            await Task.Delay(PauseBetweenLookups, ct);
        }
        if (due.Count > 0) logger.LogInformation("Checked {Count} AWB(s) with the courier.", due.Count);
    }
}
