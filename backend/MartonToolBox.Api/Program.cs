using System.Text;
using MartonToolBox.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
// Git-ignored, machine-local secrets (e.g. PayU sandbox keys). Env vars and args are
// re-added after it so they still take precedence, as with the default sources.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables()
    .AddCommandLine(args);
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<TokenService>();
builder.Services.AddMemoryCache();
builder.Services.AddControllers().AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer(); builder.Services.AddSwaggerGen();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(builder.Configuration["Cors:Origin"] ?? "http://localhost:4200").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("api", x => { x.PermitLimit = 100; x.Window = TimeSpan.FromMinutes(1); }));
var jwt = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters { ValidateIssuer = true, ValidIssuer = jwt["Issuer"], ValidateAudience = true, ValidAudience = jwt["Audience"], ValidateLifetime = true, ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!)), ClockSkew = TimeSpan.FromMinutes(1) });
builder.Services.AddAuthorization(options => options.AddPolicy(AdminPolicy.Name, p => p.RequireAuthenticatedUser().AddRequirements(new AdminRequirement())));
builder.Services.AddScoped<IAuthorizationHandler, AdminRequirementHandler>();
var app = builder.Build();
app.UseExceptionHandler(error => error.Run(async context => { var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error; app.Logger.LogError(exception, "Unhandled request failure"); context.Response.StatusCode = 500; await context.Response.WriteAsJsonAsync(new { error = "An unexpected error occurred." }); }));
app.UseHttpsRedirection(); app.UseCors(); app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();
app.Use(async (ctx, next) => { ctx.Response.Headers.Append("X-Content-Type-Options", "nosniff"); ctx.Response.Headers.Append("X-Frame-Options", "DENY"); await next(); });
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.MapControllers().RequireRateLimiting("api");
await SeedToolsAsync(app.Services);
app.Run();

static async Task SeedToolsAsync(IServiceProvider services)
{
    using var scope = services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); await db.Database.MigrateAsync();
    // The Admin role must exist so an admin can be assigned by adding a row to AspNetUserRoles.
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    if (!await roles.RoleExistsAsync(AdminPolicy.Role)) await roles.CreateAsync(new IdentityRole<Guid>(AdminPolicy.Role));
    // Adds any tool missing by slug, so new tools also reach databases seeded earlier.
    var existing = await db.Tools.Select(t => t.Slug).ToListAsync();
    db.Tools.AddRange(new[] {
        new Tool { Slug = "csv-cleaner", Name = "CSV Cleaner", Description = "Clean, deduplicate, and organize CSV files.", Category = "File Tools", Icon = "table", SortOrder = 1 },
        new Tool { Slug = "image-resizer", Name = "Image Resizer", Description = "Resize images for every social platform.", Category = "Image Tools", Icon = "image", SortOrder = 3 },
        new Tool { Slug = "pdf-toolkit", Name = "PDF Toolkit", Description = "Merge, split, reorder, and rotate PDFs privately.", Category = "File Tools", Icon = "file", SortOrder = 4 },
        new Tool { Slug = "document-converter", Name = "Document Converter", Description = "Convert PDF to Word, and Word, Excel, or PowerPoint to PDF.", Category = "File Tools", Icon = "convert", SortOrder = 5 }
    }.Where(t => !existing.Contains(t.Slug))); await db.SaveChangesAsync();
    // Retired tools: drop them from databases seeded before they were removed.
    await db.Tools.Where(t => t.Slug == "screenshot-beautifier").ExecuteDeleteAsync();

    // Demo catalog for a fresh shop; edit or hide these from the admin page.
    if (!await db.ShopProducts.AnyAsync())
    {
        var tshirt = new ShopProduct
        {
            Slug = "t-shirt", Name = "MartonToolBox T-Shirt", Price = 89m, SortOrder = 1, ImageUrl = "/images/shop/martontoolbox-tshirt.jpg",
            Description = "Classic white tee with the MartonToolBox logo printed on the chest. Soft cotton, unisex regular fit."
        };
        db.ShopProducts.Add(tshirt);
        db.ShopProductVariants.AddRange(new[] { "S", "M", "L", "XL", "XXL" }.Select((size, i) => new ShopProductVariant { ProductId = tshirt.Id, Size = size, Stock = 20, SortOrder = i }));
        await db.SaveChangesAsync();
    }
}

public partial class Program { }
