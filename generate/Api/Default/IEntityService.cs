using Api.Contexts;
using Api.Permissions;
using System.Collections.Generic;
using System.Threading.Tasks;


namespace Api.Entities
{
	/// <summary>
	/// Handles entities.
	/// Instanced automatically. Use injection to use this service, or Startup.Services.Get.
	/// </summary>
	public partial interface IEntityService
    {
		/// <summary>
		/// Delete anEntity by its ID.
		/// </summary>
		/// <param name="context"></param>
		/// <param name="id"></param>
		/// <returns></returns>
		Task<bool> Delete(Context context, int id);

		/// <summary>
		/// Get anEntity by its ID.
		/// </summary>
		Task<Entity> Get(Context context, int id);

		/// <summary>
		/// Create anEntity.
		/// </summary>
		Task<Entity> Create(Context context, Entity e);

		/// <summary>
		/// Updates the database with the given entity data. It must have an ID set.
		/// </summary>
		Task<Entity> Update(Context context, Entity e);

		/// <summary>
		/// List a filtered set of entities.
		/// </summary>
		/// <returns></returns>
		Task<List<Entity>> List(Context context, Filter<Entity> filter);

	}
}
