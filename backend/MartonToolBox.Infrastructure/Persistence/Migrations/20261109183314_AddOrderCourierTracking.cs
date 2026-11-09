using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MartonToolBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderCourierTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RegisteredAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TrackingCheckedAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RegisteredAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "TrackingCheckedAt",
                table: "Orders");
        }
    }
}
