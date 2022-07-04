var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var { getModuleMap, getModuleIdMap, getModuleFilePath, replaceModule, installSingleModule, getOrCacheZip, tidyModuleName, deleteFolderRecursive, runCmd } = require('../install/helpers.js');

function escapeSequence(...args) {
	var escapeSequence = "";
	
	for (var i = 0; i < args.length; i++) {
		escapeSequence += args[i] + "%s";
	}
	
	return escapeSequence;	
}

module.exports = (config) => {
	
	console.log("Identifying module versions in the project..");
	
	return getModuleMap()
	.then(moduleInfo => {
		
		return listSubModules(config)
		.then(subModuleInfo => {
			
			if(subModuleInfo.length > 0){
				
				if(!config.commandLine.yesididthething){
					console.log("                   __");
					console.log("                  / \\--..____");
					console.log("                   \\ \\       \\-----,,,..");
					console.log("                    \\ \\       \\         \\--,,..");
					console.log("                     \\ \\       \\         \\  ,'");
					console.log("                      \\ \\       \\         \\ ``..");
					console.log("                       \\ \\       \\         \\-''");
					console.log("                        \\ \\       \\__,,--'''");
					console.log("                         \\ \\       \\.");
					console.log("                          \\ \\      ,/");
					console.log("                           \\ \\__..-");
					console.log('                            \\ \\');
					console.log('                             \\ \\');
					console.log('                              \\ \\   So long ' + subModuleInfo.length + ' submodules and thanks for all the fish!');
					console.log('                               \\ \\');
					console.log('                                \\ \\');
					console.log('                                 \\ \\');
					console.log('                                  \\ \\');
					console.log('                                   \\ \\');
					console.log('                                    \\ \\');
					
					console.log("");
					console.log(escapeSequence("\x1b[1m\x1b[33m"), "/!\\ Warning! /!\\");
					console.log("\x1b[0m"); // reset colour
					console.log("This will delete all socialstack related submodules from this project. It does not check if any of them have local changes.");
					console.log("Before proceeding, please check your project commit window for any 'dirty' submodules, just in case you have made changes which aren't saved.");
					console.log("");
					console.log("When you have checked and are sure that it is fine to delete the submodules, run this:");
					console.log("");
					console.log("socialstack upgrade -yesididthething");
					console.log("");
					
				}else{
					
					console.log("Starting to replace submodules.");
					
					var chainPromise = replaceSubmodule(moduleInfo, subModuleInfo[0].name, config);
					
					subModuleInfo.forEach((modInfo, index) => {
						
						if(index == 0){
							return;
						}
						
						var name = modInfo.name;
						
						chainPromise = chainPromise.then(() => replaceSubmodule(moduleInfo, name, config));
					});
					
					chainPromise.then(() => {
						console.log("Finished replacement of submodules");
					});
				}
				
			}else{
				// New module format. Walk the core directories to discover what is installed, and what version they are.
				getModuleIdMap().then(moduleInfo => {
					
					var mods = [];
					searchForModules(config.projectRoot, mods);
					
					var toUpgrade = [];
					
					mods.forEach(localModule => {
						
						var remoteModule = moduleInfo[localModule.meta.moduleId + ''];
						
						// localModule can be identified in the wrong place - this happens when the .json file gets added to temporary bin files etc.
						// so, must check if the filesystem path is correct for the module.
						var idealModulePath = path.join(config.projectRoot, getModuleFilePath(remoteModule));
						
						if(idealModulePath != localModule.path){
							// Other unnecessary cached file.
							return;
						}
						
						if(remoteModule){
							if(localModule.meta.versionCode < remoteModule.latestVersionCode){
								
								if(!toUpgrade.find(i => i.id == remoteModule.id)){
									toUpgrade.push(remoteModule);
								}
							}
						}
						
					});
					
					if(toUpgrade.length != 0){
						
						console.log("Upgrading " + toUpgrade.length + " modules.");
						
						return Promise.all(
							toUpgrade.map(meta => {
								console.log(meta.name + "..");
								return replaceModule(meta, config);
							})
						);
						
					}
					
				})
				.then(() => {
					console.log("Everything is up to date.");
				});
				
			}
			
		});
	});
};

function searchForModules(dirPath, results) {
	if(!dirPath || dirPath == '/'){
		return false;
	}
  if (fs.existsSync(dirPath)) {
		fs.readdirSync(dirPath).forEach((file, index) => {
		var curPath = path.join(dirPath, file);
		if (fs.lstatSync(curPath).isDirectory()) { // recurse
			searchForModules(curPath, results);
		} else {
			if(file == 'module.installer.json'){
				
				var meta = fs.readFileSync(curPath, {encoding: 'utf8'});
				
				try{
					meta = JSON.parse(meta);
					results.push({path: dirPath, file, meta});
				}catch(e){
					console.log("Invalid json in a module's meta file at " + curPath);
				}
			}
		}
    });
	
	return true;
  }
  
  return false;
};

function replaceSubmodule(moduleInfo, name, config){
	
	var meta = moduleInfo[name.toLowerCase()];
	
	if(!meta){
		console.log("Unable to locate submodule: " + name);
		console.log("- If you see this, please let me know! -");
		console.log("Whilst remote submodules can (and do) exist in projects, the upgrade command will need some additional logic to avoid wanting to remove them each time.");
		
		return new Promise.resolve(true);
	}
	
	console.log("Replacing " + name + ".");
	
	// 1. Make sure the zip is cached.
	console.log("1/3 Ensuring new module is available..");
	return getOrCacheZip(meta).then(zipStream => {
		
		// Close the filestream:
		zipStream.close();
		
		console.log("2/3 Removing the submodule..");
		
		// Uninstall the submodule:
		return uninstallSubmodule(name, config)
		.then(() => {
			
			console.log("3/3 Installing the new module..");
			return installSingleModule(meta, config);
		})
		.then(() => {
			console.log("Upgraded " + name + " successfully.");
		});
	});
}

function uninstallSubmodule(moduleName, config){
	
	return new Promise((success, reject) => {
		
		if(!moduleName || !moduleName.trim() || moduleName == 'project'){
			success();
			return;
		}
		
		var repo = null;
		var colon = moduleName.indexOf(':');
		if(colon != -1){
			repo = moduleName.substring(0, colon);
			moduleName = moduleName.substring(colon+1);
		}
		
		var fwdSlashes = tidyModuleName(moduleName);
		
		var moduleFilePath = fwdSlashes;
		
		if(moduleFilePath.toLowerCase().indexOf('ui/') == 0){
			moduleFilePath = 'UI/Source/ThirdParty/' + moduleFilePath.substring(3);
		}else if(moduleFilePath.toLowerCase().indexOf('admin/') == 0){
			moduleFilePath = 'Admin/Source/ThirdParty/' + moduleFilePath.substring(6);
		}else if(moduleFilePath.toLowerCase().indexOf('email/') == 0){
			moduleFilePath = 'Email/Source/ThirdParty/' + moduleFilePath.substring(6);
		}else if(moduleFilePath.toLowerCase().indexOf('api/') == 0){
			moduleFilePath = 'Api/ThirdParty/' + moduleFilePath.substring(4);
		}else if(moduleFilePath != ''){
			success();
			return;
		}
		
		runCmd('git submodule deinit -f "' + moduleFilePath + '"', config)
			.then(() => runCmd('git rev-parse --show-toplevel', config))
			.then(gitRoot => {
				// Next, we need to get the 'real' directory path of the submodule.
				// This is because we need to remove a directory in .git/modules/.
				// Note that the actual .git repository meta can be a few levels up (although it's usually alongside the UI and Api directories).
				
				var normalGitRoot = path.normalize(gitRoot).trim();
				var normalProjectRoot = path.normalize(config.projectRoot).trim();
				
				if(!normalGitRoot){
					return;
				}
				
				var deltaDirectory = '';
				
				if(normalGitRoot != normalProjectRoot){
					// This is the uncommon case - where the .git repo meta is a level up or more.
					deltaDirectory = path.relative(normalGitRoot, normalProjectRoot) + '/';
				}
				
				// Meta exists?
				return new Promise((s, r) => {
					var realGitMetaPath = normalGitRoot + '/.git/modules/' + deltaDirectory + moduleFilePath;
					fs.stat(realGitMetaPath, function(err, stat){
						
						if(!stat){
							s();
							return;
						}
						
						// sync dir delete:
						deleteFolderRecursive(realGitMetaPath);
						s();
					});
				});
			})
			.then(() => runCmd('git rm -f "' + moduleFilePath + '"', config))
			.then(() => {
				success();
			})
			.catch(e => {
				console.log('Failed to remove ' + moduleName + ' (does it exist in your project?)');
				success();
			});
		
	});
}

function runCmd(cmd, config){
	return new Promise((success, reject) => {
		
		exec(
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
				
				if(stderr){
					console.log(stderr);
				}
				
				success(stdout);
			}
		);
		
	});
}

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

function listSubModules(config){
	// Go through all directories in .git/modules
	// If a directory doesn't contain a HEAD file, iterate its subdirectories.
	return new Promise((s, r) => {
		var modules = [];
		walkSubmodules(config.projectRoot + '/.git/modules', () => {
			s(modules);
		}, modules);
	});
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
