var fs  = require( 'fs' );
var path = require( 'path' );

/// <summary>
/// All files in a particular directory. The paths returned are absolute. Returns a promise which resolves as an array.
/// </summary>

module.exports = function allFilesInDirectory(dirPath, includeStats)
{
	var result = [];
	
	return new Promise((success, reject) => {
		
		getFiles(dirPath, result, () => {
			success(result);
		}, reject, includeStats);
		
	});
}

/// <summary>
/// Recursive helper function for getting files in a given dir, and putting them into the result array.
/// </summary>
function getFiles(dirPath, result, success, reject, includeStats){
	fs.readdir(dirPath, (err, list) => {
		if(err){
			reject();
			return;
		}
		
		// If any of the files are a directory, 
		var promises = list.map(entry => new Promise((entrySuccess, entryReject) => {
			var fullPath = dirPath + path.sep + entry;
			
			fs.stat(fullPath, (err, stats) => {
				if(err){
					// Some kind of directory locking issue.
					return entryReject(err);
				}
				
				if(stats.isDirectory()){
					// Find files in it:
					getFiles(fullPath, result, entrySuccess, entryReject, includeStats);
				}else{
					// Add to result:
					result.push(includeStats ? {path: fullPath, stats} : fullPath);
					entrySuccess();
				}
			});
			
		}));
		
		Promise.all(promises).then(success).catch(reject);
	});
}