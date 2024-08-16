/// <summary>
/// Global source file map.
/// </summary>
class GlobalSourceFileMap
{
	constructor(cache)
	{
		this.cache = cache;
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
		this.sortedGlobalFiles = Object.values(this.fileMap)
			.sort(
				(a,b) => (a.priority > b.priority) ? 1 : ((b.priority > a.priority) ? -1 : (a.path.localeCompare(b.path, undefined, { numeric: true })))
			);
	}
	
	/// <summary>
	/// Compares the file list with the global file list in the cache.
	/// They must be _exactly_ the same otherwise the set will be marked changed.
	/// </summary>
	checkForChanges()
	{
		this.hasChanges = this.didChange();
	}
	
	didChange()
	{
		var cache = this.cache;
		
		if(!cache.data.globalFileMap || cache.data.globalFileMap.length != this.sortedGlobalFiles.length){
			return true;
		}
		
		for(var i=0;i<this.sortedGlobalFiles.length;i++){
			var gMap = cache.data.globalFileMap[i];
			var localFile = this.sortedGlobalFiles[i];
			
			if(cache.fileChanged(gMap, localFile)){
				return true;
			}
		}
		
		// Ok!
		this.scssHeader = cache.data.globalScssHeader;
		return false;
	}
	
	/// <summary>
	/// Constructs or returns constructed SCSS header.
	/// </summary>
	getScssHeader()
	{
		if(this.scssHeader){
			return this.scssHeader;
		}
		
		var header = '';
		
		var gFiles = this.sortedGlobalFiles;
		
		for(var i=0;i<gFiles.length;i++)
		{
			header += gFiles[i].content + '\n';
		}

		header += '\n';
		
		// Strip wasted bytes (comments and newlines) to improve scss compiler performance - 
		// unfortunately it can't cache the ast so it parses the header every time it compiles a scss change:
		var mode = 0;
		var sb = '';

		for (var i = 0; i < header.length; i++)
		{
			var ch = header[i];
			var more = i < header.length - 1;

			if (mode == 1)
			{
				if (ch == '*' && more && header[i + 1] == '/')
				{
					mode = 0;
					i++;
				}
			}
			else if (mode == 2)
			{
				if (ch == '\r' || ch == '\n')
				{
					mode = 0;
				}
			}
			else if (mode == 3)
			{
				// 'string'
				if (ch == '\\' && more && header[i + 1] == '\'')
				{
					// Escaped end quote
					sb += ch;
					sb += '\'';
					i++;
				}
				else if (ch == '\'')
				{
					// exited string
					mode = 0;
					sb += ch;
				}
				else
				{
					sb += ch;
				}
			}
			else if (mode == 4)
			{
				// "string"
				if (ch == '\\' && more && header[i + 1] == '"')
				{
					// Escaped end quote
					sb += ch;
					sb += '"';
					i++;
				}
				else if (ch == '"')
				{
					// exited string
					mode = 0;
					sb += ch;
				}
				else
				{
					sb += ch;
				}
			}
			else if (ch == '\'')
			{
				mode = 3;
				sb += ch;
			}
			else if (ch == '\"')
			{
				mode = 4;
				sb += ch;
			}
			else if (ch == '/' && more && header[i + 1] == '*')
			{
				mode = 1;
				i++;
			}
			else if (ch == '/' && more && header[i + 1] == '/')
			{
				mode = 2;
				i++;
			}
			else
			{
				sb += ch;
			}
		}
		
		this.scssHeader = sb;
		return sb;
	}
	
	loadContents(){
		var gFiles = this.sortedGlobalFiles;
		
		var proms = [];
		
		for(var i=0;i<gFiles.length;i++)
		{
			var file = gFiles[i];
			proms.push(file.loadTextContent());
		}
		
		// Clear header:
		this.scssHeader = null;
		
		return Promise.all(proms).then(() => {
			// Build the header:
			this.getScssHeader();
		});
	}
	
}


module.exports = GlobalSourceFileMap;