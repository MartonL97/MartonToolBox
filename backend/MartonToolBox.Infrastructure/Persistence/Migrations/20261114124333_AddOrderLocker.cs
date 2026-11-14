using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MartonToolBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderLocker : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LockerId",
                table: "Orders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LockerName",
                table: "Orders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LockerId",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "LockerName",
                table: "Orders");
        }
    }
}
