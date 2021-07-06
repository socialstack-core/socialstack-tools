var mkdir = require('./mkdirDeep.js');
var fs = require('fs');
var path = require('path');

function copyStaticFile(fullPath, targetPath, onlyIfNewer, onDone){
	
	return new Promise((onDone) => {
		
		function copyTheFile(){
			// Make target dir if it doesn't exist:
			
			// Clean the dirs:
			fullPath = fullPath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
			targetPath = targetPath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
			
			var from = path.resolve(fullPath);
			var to = path.resolve(targetPath);
			
			// Targeting dir:
			var targetDirectory = path.dirname(to);
			
			// Make sure dir exists:
			mkdir(targetDirectory);
			
			console.log(from + '->' + to);
			
			// Copy into it:
			fs.copyFile(from, to, (err) => {
				if(err){
					console.error(err);
					return;
				}
				
				// Ok:
				onDone();
			});
			
		}
		
		if(onlyIfNewer){
			// Get file stats for both:
			
			var pending = [null,null];
			
			fs.stat(fullPath, function(err, stats){
				onStats(0, err, stats);
			});
			fs.stat(targetPath, function(err, stats){
				onStats(1, err, stats);
			});
			
			function onStats(index, err, stats){
				pending[index] = {err, stats};
				
				if(!pending[0] || !pending[1]){
					return;
				}
				
				// Copy is required if:
				// - Either errored (first one ideally never does)
				// - [0] write time is after [1] write time:
				// - They're different sizes
				if(
					pending[0].err || pending[1].err || 
					pending[0].stats.mtime > pending[1].stats.mtime ||
					pending[0].stats.size != pending[1].stats.size
				){
					// Copy required:
					copyTheFile();
				}else{
					// Copy wasn't needed - file is already up to date.
					onDone();
				}
			}
			
		}else{
			// Copy now:
			copyTheFile();
		}
	});
}

module.exports = copyStaticFile;