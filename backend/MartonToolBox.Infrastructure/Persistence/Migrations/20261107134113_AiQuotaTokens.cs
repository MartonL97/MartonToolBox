using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MartonToolBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AiQuotaTokens : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "DailyLimit",
                table: "AiPackGrants",
                newName: "DailyTokens");

            migrationBuilder.AddColumn<int>(
                name: "Tokens",
                table: "AiUsages",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Tokens",
                table: "AiUsages");

            migrationBuilder.RenameColumn(
                name: "DailyTokens",
                table: "AiPackGrants",
                newName: "DailyLimit");
        }
    }
}
