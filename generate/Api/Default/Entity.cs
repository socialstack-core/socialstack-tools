using System;
using Api.Database;
using Api.Translate;
using Api.Users;


namespace Api.Entities
{
	
	/// <summary>
	/// AnEntity
	/// </summary>
	public partial class Entity : VersionedContent<uint>
	{
		// Example fields. None are required:
		/*
        /// <summary>
        /// The name of the entity
        /// </summary>
        [DatabaseField(Length = 200)]
		[Localized]
		public string Name;
		
		/// <summary>
		/// The content of this entity.
		/// </summary>
		[Localized]
		public string BodyJson;

		/// <summary>
		/// The feature image ref
		/// </summary>
		[DatabaseField(Length = 80)]
		public string FeatureRef;
		*/
		
	}

}