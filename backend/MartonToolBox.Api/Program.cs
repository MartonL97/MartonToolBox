using System.Text;
using MartonToolBox.Api.Services;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<TokenService>();
builder.Services.AddControllers(); builder.Services.AddEndpointsApiExplorer(); builder.Services.AddSwaggerGen();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(builder.Configuration["Cors:Origin"] ?? "http://localhost:4200").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("api", x => { x.PermitLimit = 100; x.Window = TimeSpan.FromMinutes(1); }));
var jwt = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters { ValidateIssuer = true, ValidIssuer = jwt["Issuer"], ValidateAudience = true, ValidAudience = jwt["Audience"], ValidateLifetime = true, ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt["Key"]!)), ClockSkew = TimeSpan.FromMinutes(1) });
builder.Services.AddAuthorization();
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
    if (await db.Tools.AnyAsync()) return;
    db.Tools.AddRange(new[] {
        new Tool { Slug = "csv-cleaner", Name = "CSV Cleaner", Description = "Clean, deduplicate, and organize CSV files.", Category = "File Tools", Icon = "table", SortOrder = 1 },
        new Tool { Slug = "screenshot-beautifier", Name = "Screenshot Beautifier", Description = "Turn ordinary screenshots into polished visuals.", Category = "Image Tools", Icon = "sparkles", SortOrder = 2 },
        new Tool { Slug = "image-resizer", Name = "Image Resizer", Description = "Resize images for every social platform.", Category = "Image Tools", Icon = "image", SortOrder = 3 }
    }); await db.SaveChangesAsync();
}

public partial class Program { }
