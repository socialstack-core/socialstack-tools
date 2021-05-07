/// <summary>
/// Global source file map.
/// </summary>
class GlobalSourceFileMap
{
	constructor()
	{
		this.fileMap = {};
		this.npmPackages = {};
		this.sortedGlobalFiles = [];
	}
	
	/// <summary>
	/// Reconstructs sorted global files based on the map.
	/// </summary>
	sort()
	{
		var keys = Object.values(this.fileMap);
		this.sortedGlobalFiles = Object.values(this.fileMap).sort((a,b) => (a.priority > b.priority) ? 1 : ((b.priority > a.priority) ? -1 : 0));
	}
}


module.exports = GlobalSourceFileMap;