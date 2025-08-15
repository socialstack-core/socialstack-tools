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
		// Example fields. None are required. 
		// Wrap the type with Localized<> if you'd like the value to vary by locale:
		/*
        /// <summary>
        /// The name of the entity
        /// </summary>
        [DatabaseField(Length = 200)]
		public string Name;
		
		/// <summary>
		/// The content of this entity.
		/// </summary>
		public JsonString BodyJson;

		/// <summary>
		/// The feature image ref
		/// </summary>
		[DatabaseField(Length = 80)]
		public string FeatureRef;
		*/
		
	}

}