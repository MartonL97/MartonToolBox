using MartonToolBox.Application.Documents;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/documents"), Authorize]
public sealed class DocumentsController(IDocumentConverter converter, ILicenseService licenses, UserManager<AppUser> users) : ControllerBase
{
    private const long MaxBytes = 25_000_000;

    [HttpPost("convert"), RequestSizeLimit(MaxBytes + 1_000_000)]
    public async Task<IActionResult> Convert(IFormFile file, [FromForm] string target, CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await licenses.HasAccessAsync(user.Id, ct)) return StatusCode(402, new { error = "An active license is required to use this tool." });
        if (file is null || file.Length is 0 or > MaxBytes) return BadRequest(new { error = "Upload a document smaller than 25 MB." });

        try
        {
            using var stream = file.OpenReadStream();
            var result = await converter.ConvertAsync(stream, file.FileName, target ?? string.Empty, ct);
            return File(result.Content, result.ContentType, result.FileName);
        }
        catch (DocumentConversionException ex)
        {
            return UnprocessableEntity(new { error = ex.Message });
        }
    }
}
