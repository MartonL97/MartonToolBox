using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using MartonToolBox.Application.Shipping;
using MartonToolBox.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace MartonToolBox.Infrastructure.Services;

/// <summary>
/// Reads an AWB's history from Sameday's public tracking endpoint. It needs no account but is undocumented, so a
/// failed lookup is never fatal: the order keeps its current step and an admin can still move it by hand.
/// </summary>
public sealed class SamedayTrackingService(HttpClient http, ILogger<SamedayTrackingService> logger) : ICourierTracking
{
    public async Task<IReadOnlyList<CourierEvent>?> GetEventsAsync(string awb, CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await http.GetAsync($"api/public/awb/{Uri.EscapeDataString(awb)}/awb-history?_format=json", cancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            response.EnsureSuccessStatusCode();
            var events = Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            foreach (var unknown in events.Where(e => e.Stage is null)) logger.LogInformation("Sameday status not mapped to a step for AWB {Awb}: {Status}", awb, unknown.Status);
            return events;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException || (ex is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            logger.LogWarning(ex, "Could not read Sameday status for AWB {Awb}.", awb);
            return null;
        }
    }

    public static IReadOnlyList<CourierEvent> Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (!root.TryGetProperty("awbHistory", out var history) || history.ValueKind != JsonValueKind.Array) return [];
        var isReturn = root.TryGetProperty("isReturn", out var r) && r.ValueKind == JsonValueKind.True;

        var events = new List<CourierEvent>();
        foreach (var entry in history.EnumerateArray())
        {
            if (!DateTimeOffset.TryParse(Text(entry, "statusDate"), CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var at)) continue;
            var state = Text(entry, "statusState");
            var status = Text(entry, "status");
            var stateId = entry.TryGetProperty("statusStateId", out var id) && id.ValueKind == JsonValueKind.Number ? id.GetInt32() : (int?)null;
            // Stored as UTC: the database rejects other offsets.
            events.Add(new CourierEvent(status.Length > 0 ? status : state, isReturn ? null : Classify(stateId, state + " " + status), at.ToUniversalTime()));
        }
        return events.OrderBy(e => e.At).ToList();
    }

    /// <summary>
    /// Maps Sameday's wording to a step. Only state 1 ("registered") has been seen in a real response; the rest go by
    /// keywords, checked so that "will be delivered" or "can be collected" never count as delivered.
    /// </summary>
    public static CourierStage? Classify(int? stateId, string text)
    {
        var t = Normalize(text);
        bool Has(params string[] words) => words.Any(t.Contains);

        if (Has("retur", "anulat", "refuz", "nelivrat", "nu a fost", "nu a putut", "esec", "cancel", "failed")) return null;
        if (stateId == 1 || Has("inregistrat", "registered")) return CourierStage.Registered;
        if (Has("curs de livrare", "in livrare", "pentru livrare", "spre livrare", "va fi livrat", "poate fi ridicat", "asteapta", "depus", "out for delivery")) return CourierStage.OutForDelivery;
        if (Has("livrat", "delivered") || (Has("ridicat") && Has("locker", "easybox", "destinatar"))) return CourierStage.Delivered;
        if (Has("depozit", "hub", "sortare", "depot", "warehouse")) return CourierStage.AtDepot;
        if (Has("ridicat", "preluat", "tranzit", "picked up", "transit")) return CourierStage.Shipped;
        return null;
    }

    private static string Text(JsonElement entry, string name) =>
        entry.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()!.Trim() : string.Empty;

    private static string Normalize(string text)
    {
        var plain = text.Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark);
        return string.Concat(plain).ToLowerInvariant();
    }
}

public static class CourierTimeline
{
    /// <summary>
    /// Moves the order forward from the courier's statuses, oldest first. Steps the courier skipped take the date of
    /// the later one (shipping dates also drive stock). It never moves an order back or changes a date already set.
    /// </summary>
    public static void Apply(Order order, IEnumerable<CourierEvent> events)
    {
        foreach (var e in events)
        {
            if (e.Stage is not { } stage) continue;
            order.PreparedAt ??= e.At;
            order.RegisteredAt ??= e.At;
            if (stage >= CourierStage.Shipped) order.ShippedAt ??= e.At;
            if (stage >= CourierStage.AtDepot) order.AtCourierDepotAt ??= e.At;
            if (stage >= CourierStage.OutForDelivery) order.OutForDeliveryAt ??= e.At;
            if (stage >= CourierStage.Delivered) order.DeliveredAt ??= e.At;
        }
    }
}
