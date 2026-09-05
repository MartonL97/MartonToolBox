using MartonToolBox.Domain.Entities;

namespace MartonToolBox.Application.Licensing;

public interface ILicenseService
{
    Task<License?> GetActiveLicenseAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<bool> HasAccessAsync(Guid userId, CancellationToken cancellationToken = default);
}
