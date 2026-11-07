using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;

namespace MartonToolBox.Infrastructure.Services;

public static class LicenseGrantor
{
    public static async Task<bool> GrantIfNeededAsync(AppDbContext db, ILicenseService licenses, Order order, CancellationToken ct)
    {
        // Shop and AI pack orders are paid through the same providers but never unlock the tools.
        if (order.Kind != OrderKinds.License) return false;
        if (await licenses.HasAccessAsync(order.UserId, ct)) return false;
        db.Licenses.Add(new License
        {
            UserId = order.UserId,
            LicenseKey = $"MTB-{Guid.NewGuid():N}".ToUpperInvariant(),
            Product = LicenseProduct.Lifetime,
            Status = LicenseStatus.Active
        });
        return true;
    }
}
