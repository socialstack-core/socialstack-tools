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
		Task<FullyQualifiedEntity> Get(Context context, int id);

		/// <summary>
		/// Create anEntity.
		/// </summary>
		Task<FullyQualifiedEntity> Create(Context context, FullyQualifiedEntity e);

		/// <summary>
		/// Updates the database with the given entity data. It must have an ID set.
		/// </summary>
		Task<FullyQualifiedEntity> Update(Context context, FullyQualifiedEntity e);

		/// <summary>
		/// List a filtered set of entities.
		/// </summary>
		/// <returns></returns>
		Task<List<FullyQualifiedEntity>> List(Context context, Filter<FullyQualifiedEntity> filter);

	}
}
