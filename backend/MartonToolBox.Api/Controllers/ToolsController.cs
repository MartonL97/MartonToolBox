using MartonToolBox.Api.Contracts;
using MartonToolBox.Application.Tools;
using MartonToolBox.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MartonToolBox.Api.Controllers;

[ApiController, Route("api/tools")]
public sealed class ToolsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ToolDto>>>> List(CancellationToken ct) => Ok(new ApiResponse<IReadOnlyList<ToolDto>>(await db.Tools.Where(x => x.IsEnabled).OrderBy(x => x.SortOrder).Select(x => new ToolDto(x.Slug, x.Name, x.Description, x.Category, x.Icon, x.SortOrder)).ToListAsync(ct)));
    [HttpGet("{slug}")]
    public async Task<ActionResult<ApiResponse<ToolDto>>> Get(string slug, CancellationToken ct)
    {
        var tool = await db.Tools.Where(x => x.IsEnabled && x.Slug == slug).Select(x => new ToolDto(x.Slug, x.Name, x.Description, x.Category, x.Icon, x.SortOrder)).FirstOrDefaultAsync(ct);
        return tool is null ? NotFound() : Ok(new ApiResponse<ToolDto>(tool));
    }
}
