using AwsAccounting.Api.Modules;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AwsAccounting.Api.Controllers;

[ApiController]
[Route("api/meta")]
[Authorize]
public class MetaController : ControllerBase
{
    /// <summary>The module/feature permission catalog — powers the admin permission tree.</summary>
    [HttpGet("permissions")]
    public IActionResult Permissions() =>
        Ok(PermissionCatalog.Modules.Select(m => new
        {
            m.Key,
            m.Name,
            features = m.Features.Select(f => new { f.Key, f.Label }),
        }));
}
