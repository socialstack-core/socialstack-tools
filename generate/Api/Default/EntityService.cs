using Api.Database;
using System.Threading.Tasks;
using System.Collections.Generic;
using Api.Permissions;
using Api.Contexts;
using Api.Eventing;

namespace Api.Entities
{
	/// <summary>
	/// Handles entities.
	/// Instanced automatically. Use injection to use this service, or Startup.Services.Get.
	/// </summary>
	public partial class EntityService : AutoService<FullyQualifiedEntity>
    {
		/// <summary>
		/// Instanced automatically. Use injection to use this service, or Startup.Services.Get.
		/// </summary>
		public EntityService() : base(Events.Entity)
        {
			// Example admin page install:
			// InstallAdminPages("Entities", "fa:fa-rocket", new string[] { "id", "name" });
		}
	}
    
}
