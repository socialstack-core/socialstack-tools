
/*
* Checks if the given directory is a socialstack project root.
* Calls the given callback as callback(isRoot) where isRoot is true/false.
*/
var fs = require('fs');
var path = require('path');

function isProjectRoot(dirPath, callback){
	// The root can be identified by looking for the dir with 'UI' and 'Api' child directories.
	var pending = 2;
	var matchesRequired = 2;
	
	function dirReturn(err, stats){
		pending--;
		if(!err && stats.isDirectory()){
			matchesRequired--;
		}
		
		if(pending == 0){
			callback(matchesRequired == 0);
		}
	}
	
	fs.stat(dirPath + '/UI', dirReturn);
	fs.stat(dirPath + '/Api', dirReturn);
}

/*
* Finds the project root directory, or errors if it wasn't possible.
* Calls the given done callback as done(config) if it was successful.
*/
function findProjectRoot(config, done){
	var currentPath = config.calledFromPath;
	
	function onCheckedRoot(success){
		if(success){
			config.projectRoot = currentPath;
			done(config);
		}else{
			var nextPath = path.dirname(currentPath);
			
			if(currentPath == nextPath){
				// Nope!
				done(null);
				return;
			}else{
				currentPath = nextPath;
				isProjectRoot(currentPath, onCheckedRoot);
			}
		}
	}
	
	isProjectRoot(currentPath, onCheckedRoot);
}

module.exports = {
	findProjectRoot,
	isProjectRoot
};