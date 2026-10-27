using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MartonToolBox.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductSizes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Size",
                table: "OrderItems",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "VariantId",
                table: "OrderItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ShopProductVariants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Size = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Stock = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopProductVariants", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShopProductVariants_ProductId_Size",
                table: "ShopProductVariants",
                columns: new[] { "ProductId", "Size" },
                unique: true);

            // Catalog change for databases seeded with the original six demo products: keep only the
            // T-shirt (now with its mockup photo and S–XXL sizes) and hide the rest. Does nothing on a
            // fresh database, where the startup seed creates the T-shirt with sizes itself.
            migrationBuilder.Sql("""
                UPDATE "ShopProducts" SET "IsActive" = FALSE WHERE "Slug" <> 't-shirt';
                UPDATE "ShopProducts" SET
                    "Name" = 'MartonToolBox T-Shirt',
                    "Description" = 'Classic white tee with the MartonToolBox logo printed on the chest. Soft cotton, unisex regular fit.',
                    "ImageUrl" = '/images/shop/martontoolbox-tshirt.jpg',
                    "IsActive" = TRUE,
                    "SortOrder" = 1
                WHERE "Slug" = 't-shirt';
                INSERT INTO "ShopProductVariants" ("Id", "ProductId", "Size", "Stock", "SortOrder")
                SELECT gen_random_uuid(), p."Id", v.size, 20, v.ord
                FROM "ShopProducts" p CROSS JOIN (VALUES ('S', 0), ('M', 1), ('L', 2), ('XL', 3), ('XXL', 4)) AS v(size, ord)
                WHERE p."Slug" = 't-shirt';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShopProductVariants");

            migrationBuilder.DropColumn(
                name: "Size",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "VariantId",
                table: "OrderItems");
        }
    }
}
