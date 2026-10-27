using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Csv;
using MartonToolBox.Application.Licensing;
using MartonToolBox.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/csv"), Authorize]
public sealed class CsvController(ICsvService csv, ILicenseService licenses, UserManager<AppUser> users) : ControllerBase
{
    [HttpPost("preview"), RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<ApiResponse<CsvPreviewDto>>> Preview(IFormFile file, CancellationToken ct)
    {
        var denied = await DenyIfUnlicensedAsync(ct);
        if (denied is not null) return denied;
        if (!IsCsv(file)) return BadRequest(new { error = "Upload a CSV file smaller than 10 MB." });
        using var stream = file.OpenReadStream(); return Ok(new ApiResponse<CsvPreviewDto>(csv.Preview(stream)));
    }
    [HttpPost("process"), RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> Process(IFormFile file, [FromForm] bool removeDuplicates = true, [FromForm] bool removeEmptyRows = true, [FromForm] bool trimWhitespace = true, CancellationToken ct = default)
    {
        var denied = await DenyIfUnlicensedAsync(ct);
        if (denied is not null) return denied;
        if (!IsCsv(file)) return BadRequest(new { error = "Upload a CSV file smaller than 10 MB." });
        using var stream = file.OpenReadStream(); var result = csv.Clean(stream, new CsvCleanRequest(removeDuplicates, removeEmptyRows, trimWhitespace));
        Response.Headers.Append("X-Original-Rows", result.OriginalRows.ToString()); Response.Headers.Append("X-Result-Rows", result.ResultRows.ToString());
        return File(result.Content, "text/csv; charset=utf-8", "cleaned.csv");
    }
    private async Task<ActionResult?> DenyIfUnlicensedAsync(CancellationToken ct)
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        if (!await licenses.HasAccessAsync(user.Id, ct)) return StatusCode(402, new { error = "An active license is required to use this tool." });
        return null;
    }
    private static bool IsCsv(IFormFile file) => file.Length is > 0 and <= 10_000_000 && string.Equals(Path.GetExtension(file.FileName), ".csv", StringComparison.OrdinalIgnoreCase);
}
