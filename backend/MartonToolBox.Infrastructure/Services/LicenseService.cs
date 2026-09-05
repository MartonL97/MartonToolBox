using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Infrastructure.Services;

public sealed class LicenseService(AppDbContext db) : ILicenseService
{
    public Task<License?> GetActiveLicenseAsync(Guid userId, CancellationToken ct = default) => db.Licenses.FirstOrDefaultAsync(x => x.UserId == userId && x.Status == LicenseStatus.Active && (x.ExpiresAt == null || x.ExpiresAt > DateTimeOffset.UtcNow), ct);
    public async Task<bool> HasAccessAsync(Guid userId, CancellationToken ct = default) => await GetActiveLicenseAsync(userId, ct) is not null;
}
