using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MartonToolBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserRolesView : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Read-only, human-friendly view of AspNetUserRoles (which only stores ids) for browsing in
            // pgAdmin/psql. To grant or revoke a role, still insert/delete rows in AspNetUserRoles.
            migrationBuilder.Sql("""
                CREATE VIEW "UserRolesView" AS
                SELECT ur."UserId", u."Email", u."DisplayName", ur."RoleId", r."Name" AS "RoleName"
                FROM "AspNetUserRoles" ur
                JOIN "AspNetUsers" u ON u."Id" = ur."UserId"
                JOIN "AspNetRoles" r ON r."Id" = ur."RoleId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DROP VIEW IF EXISTS "UserRolesView";""");
        }
    }
}
