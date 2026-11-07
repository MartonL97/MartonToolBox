using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MartonToolBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAiQuota : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AiPackGrants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Pack = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    PackName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    DailyLimit = table.Column<int>(type: "integer", nullable: false),
                    Days = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiPackGrants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AiUsages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiUsages", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiPackGrants_OrderId",
                table: "AiPackGrants",
                column: "OrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiPackGrants_UserId_ExpiresAt",
                table: "AiPackGrants",
                columns: new[] { "UserId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiUsages_UserId_CreatedAt",
                table: "AiUsages",
                columns: new[] { "UserId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiPackGrants");

            migrationBuilder.DropTable(
                name: "AiUsages");
        }
    }
}
