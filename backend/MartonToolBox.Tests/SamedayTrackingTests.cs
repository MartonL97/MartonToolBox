using MartonToolBox.Application.Shipping;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Services;
using Xunit;

namespace MartonToolBox.Tests;

public sealed class SamedayTrackingTests
{
    // The shape of a real response from /api/public/awb/{awb}/awb-history?_format=json.
    private const string Registered = """
        {"awbNumber":"1VTDLL000000000","awbHistory":[{"county":"","country":"","status":"Ridicăm în curând coletul de la expeditor.","statusId":1,
        "statusState":"Expedierea a fost înregistrată","statusStateId":1,"transitLocation":"","reasonId":"","reason":"","statusDate":"2026-11-06T10:28:19+02:00"}],
        "isLockerService":true,"isReturn":false}
        """;

    [Fact]
    public void Reads_a_registered_shipment_with_its_date_in_utc()
    {
        var e = Assert.Single(SamedayTrackingService.Parse(Registered));
        Assert.Equal(CourierStage.Registered, e.Stage);
        Assert.Equal(new DateTimeOffset(2026, 11, 6, 8, 28, 19, TimeSpan.Zero), e.At);
        Assert.Equal(TimeSpan.Zero, e.At.Offset);
    }

    [Theory]
    [InlineData("Colet preluat de curier", CourierStage.Shipped)]
    [InlineData("Coletul a ajuns în depozit", CourierStage.AtDepot)]
    [InlineData("Colet în curs de livrare", CourierStage.OutForDelivery)]
    [InlineData("Coletul va fi livrat azi", CourierStage.OutForDelivery)]
    [InlineData("Coletul poate fi ridicat din easybox", CourierStage.OutForDelivery)]
    [InlineData("Colet livrat", CourierStage.Delivered)]
    [InlineData("Coletul a fost ridicat din easybox", CourierStage.Delivered)]
    public void Maps_wording_to_a_step(string text, CourierStage expected) =>
        Assert.Equal(expected, SamedayTrackingService.Classify(null, text));

    [Theory]
    [InlineData("Colet nelivrat")]
    [InlineData("Livrare refuzată de destinatar")]
    [InlineData("Colet returnat la expeditor")]
    [InlineData("Status necunoscut")]
    public void Failed_returned_or_unknown_statuses_move_nothing(string text) =>
        Assert.Null(SamedayTrackingService.Classify(null, text));

    [Fact]
    public void Skipped_steps_are_filled_so_stock_counts_the_order_as_shipped()
    {
        var at = DateTimeOffset.UtcNow;
        var order = new Order();
        CourierTimeline.Apply(order, [new CourierEvent("x", CourierStage.OutForDelivery, at)]);
        Assert.Equal(at, order.ShippedAt);
        Assert.Equal(at, order.OutForDeliveryAt);
        Assert.Null(order.DeliveredAt);
    }

    [Fact]
    public void Dates_already_set_are_kept()
    {
        var earlier = DateTimeOffset.UtcNow.AddDays(-1);
        var order = new Order { ShippedAt = earlier };
        CourierTimeline.Apply(order, [new CourierEvent("x", CourierStage.Shipped, DateTimeOffset.UtcNow)]);
        Assert.Equal(earlier, order.ShippedAt);
    }
}
