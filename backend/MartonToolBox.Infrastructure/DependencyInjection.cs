using MartonToolBox.Application.Csv;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Application.Payments;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using MartonToolBox.Infrastructure.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MartonToolBox.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(configuration.GetConnectionString("Postgres")));
        services.AddIdentityCore<AppUser>(options => { options.User.RequireUniqueEmail = true; options.Password.RequiredLength = 8; })
            .AddRoles<IdentityRole<Guid>>().AddEntityFrameworkStores<AppDbContext>().AddDefaultTokenProviders();
        services.AddScoped<ICsvService, CsvService>(); services.AddScoped<ILicenseService, LicenseService>(); services.AddScoped<IPaymentService, FakePaymentService>();
        return services;
    }
}
