var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

module.exports = (config) => {
	
	console.log("Identifying module versions in the project..");
	
	return listModules(config)
	.then(moduleInfo => {
		console.log("Discovered " + moduleInfo.length + " modules in this project. Collecting module versions..");
		
		var detachedCount = 0;
		var modulesToCheck = [];
		
		moduleInfo.forEach(module => {
			if(!module.branch)
			{
				detachedCount++;
			}
			
			modulesToCheck.push({name: module.name, version: module.head});
		});
		
		if(detachedCount > 0){
			console.log('You\'ve currently got ' + detachedCount + ' "detached head" modules. These are normal - just make sure to switch to master when pushing custom changes to them.');
		}
		
		// Ask the SS dev repo about these modules (some may be custom modules - not all will actually exist).
		// console.log('Checking versions..');
		// console.log(modulesToCheck);
		
		// Send modulesToCheck to custom API which compares the array of module+version with the gitlab data local to the server.
		// (TBD!)
		// The list it responds with are then the modules that actually get pulled
		
		// Just a basic "upgrade all submodules" for now:
		// - Needs to of course be considerate for custom submodules in a project, as well as just be faster.
		//   This command does each module one at a time, and can take a few minutes, vs. having some index of latest commit hashes.
		return runCmd('git submodule foreach git pull origin master', config);
	});
};

/*
* Walks the given filesystem.
* The resulting file set is relative to the target directory.
*/
function walkSubmodules(dir, done, results) {
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done();
    list.forEach(function(file) {
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
			// Attempt to read its HEAD file (an error indicates it doesn't have one, which is fine).
			fs.readFile(file + '/HEAD', 'utf8', function(err, data) {
				if(err && err.code == 'ENOENT'){
					walkSubmodules(file, function(err, res) {
						if (!--pending) done();
					  }, results);
				}else{
					if(data){
						data = data.trim();
					}else{
						data = '';
					}
					
					// Get module nice name.
					var parts = file.replace(/\\/g, '/').split('/.git/modules/');
					
					if(parts.length >= 2){
						parts = parts[1].split('/');
					}
					
					var moduleNameParts = [];
					
					for(var i=0;i<parts.length;i++){
						var part = parts[i].toLowerCase();
						if(part == 'thirdparty'){
							continue;
						}
						
						if(i == 1 && part == 'source' && parts[0].toLowerCase() != 'api'){
							continue;
						}
						
						moduleNameParts.push(parts[i]);
					}
					
					var name = moduleNameParts.join('/');
					
					if(data.startsWith('ref:')){
						// Get the branch it refs:
						var reffing = data.substring(4).trim();
						
						fs.readFile(file + '/' + reffing, 'utf8', function(err, data) {
							
							if(err){
								console.log("[WARN] Unable to resolve pathspec: " + reffing + " in " + file);
							}else{
								results.push({path: file, name, branch:reffing, head: data});
							}
							if (!--pending) done(null, results);
							
						});
					}else{
						results.push({path: file, name, head: data});
						if (!--pending) done(null, results);
					}
				}
			});
        } else {
			pending--;
            if (!--pending) done(null, results);
        }
      });
    });
  });
};

function listModules(config){
	// Go through all directories in .git/modules
	// If a directory doesn't contain a HEAD file, iterate its subdirectories.
	return new Promise((s, r) => {
		var modules = [];
		walkSubmodules(config.projectRoot + '/.git/modules', () => {
			s(modules);
		}, modules);
	})
	
	/*
	return runCmd('git submodule status', {...config, silent: 1}).then(stdout => {
		var lines = stdout.replace(/\r/g, '\n').split('\n');
		
		var moduleInfo = [];
		
		for(var i=0;i<lines.length;i++){
			var line = lines[i].trim();
			if(!line){
				continue;
			}
			
			var spaceAfterCommitId = line.indexOf(' ');
			var bracketBeforeBranchName = line.lastIndexOf('(');
			
			if(spaceAfterCommitId == -1 || bracketBeforeBranchName == -1){
				continue;
			}
			
			var commitId = line.substring(0,spaceAfterCommitId);
			var branch = line.substring(bracketBeforeBranchName);
			
			moduleInfo.push({
				commitId,
				branch,
				path: line.substring(spaceAfterCommitId + 1, bracketBeforeBranchName-1).trim()
			})
		}
		
		console.log(moduleInfo);
		return moduleInfo;
	});
	*/
}

function runCmd(cmd, config){
	return new Promise((success, reject) => {
		
		var proc = exec(
			cmd,
			{
				cwd: config.projectRoot
			},
			function(err, stdout, stderr){
				if(err){
					// Fail:
					reject(err);
					return;
				}
				
				success(stdout);
			}
		);
		
		if(!config || !config.silent){
			proc.stdout.pipe(process.stdout);
		}
		proc.stderr.pipe(process.stderr);
	});
}
