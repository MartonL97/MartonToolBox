using MartonToolBox.Application.Csv;
using MartonToolBox.Application.Documents;
using MartonToolBox.Application.Email;
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
        services.AddScoped<ICsvService, CsvService>(); services.AddSingleton<IDocumentConverter, LibreOfficeConverter>(); services.AddSingleton<IEmailSender, SmtpEmailSender>(); services.AddScoped<ILicenseService, LicenseService>();

        // Registered unconditionally so its notify endpoint works regardless
        // of which provider is the active default below.
        services.AddHttpClient<PayUPaymentService>((sp, client) =>
        {
            var cfg = sp.GetRequiredService<IConfiguration>();
            var testMode = cfg.GetValue("PayU:TestMode", true);
            client.BaseAddress = new Uri(testMode ? PayUPaymentService.SandboxBaseUrl : cfg["PayU:BaseUrl"] ?? "https://secure.payu.com/");
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });

        if (string.Equals(configuration["Payments:Provider"], "Fake", StringComparison.OrdinalIgnoreCase))
        {
            services.AddScoped<IPaymentService, FakePaymentService>();
        }
        else if (string.Equals(configuration["Payments:Provider"], "PayU", StringComparison.OrdinalIgnoreCase))
        {
            services.AddScoped<IPaymentService>(sp => sp.GetRequiredService<PayUPaymentService>());
        }
        else
        {
            services.AddHttpClient<RevolutPaymentService>((sp, client) =>
            {
                var cfg = sp.GetRequiredService<IConfiguration>();
                client.BaseAddress = new Uri(cfg["Revolut:BaseUrl"] ?? "https://sandbox-merchant.revolut.com/");
                client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cfg["Revolut:SecretKey"]);
                client.DefaultRequestHeaders.Add("Revolut-Api-Version", cfg["Revolut:ApiVersion"] ?? "2024-09-01");
            });
            services.AddScoped<IPaymentService>(sp => sp.GetRequiredService<RevolutPaymentService>());
        }

        return services;
    }
}
