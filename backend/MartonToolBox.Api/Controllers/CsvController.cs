using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Csv;
using Microsoft.AspNetCore.Mvc;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/csv")]
public sealed class CsvController(ICsvService csv) : ControllerBase
{
    [HttpPost("preview"), RequestSizeLimit(10_000_000)]
    public ActionResult<ApiResponse<CsvPreviewDto>> Preview(IFormFile file)
    {
        if (!IsCsv(file)) return BadRequest(new { error = "Upload a CSV file smaller than 10 MB." });
        using var stream = file.OpenReadStream(); return Ok(new ApiResponse<CsvPreviewDto>(csv.Preview(stream)));
    }
    [HttpPost("process"), RequestSizeLimit(10_000_000)]
    public IActionResult Process(IFormFile file, [FromForm] bool removeDuplicates = true, [FromForm] bool removeEmptyRows = true, [FromForm] bool trimWhitespace = true)
    {
        if (!IsCsv(file)) return BadRequest(new { error = "Upload a CSV file smaller than 10 MB." });
        using var stream = file.OpenReadStream(); var result = csv.Clean(stream, new CsvCleanRequest(removeDuplicates, removeEmptyRows, trimWhitespace));
        Response.Headers.Append("X-Original-Rows", result.OriginalRows.ToString()); Response.Headers.Append("X-Result-Rows", result.ResultRows.ToString());
        return File(result.Content, "text/csv; charset=utf-8", "cleaned.csv");
    }
    private static bool IsCsv(IFormFile file) => file.Length is > 0 and <= 10_000_000 && string.Equals(Path.GetExtension(file.FileName), ".csv", StringComparison.OrdinalIgnoreCase);
}
