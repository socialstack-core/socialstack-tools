using Microsoft.AspNetCore.Mvc;

namespace Api.Entities
{
    /// <summary>Handles entity endpoints.</summary>
    [Route("v1/entity")]
	public partial class EntityController : AutoController<Entity>
    {
    }
}