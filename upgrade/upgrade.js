var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var diff = require('diff');
var readline = require('readline');

var { 
	getModuleMap, getModuleIdMap, getModuleFilePath, 
	replaceModule, installSingleModule, getOrCacheZip, 
	tidyModuleName, deleteFolderRecursive, runCmd,
	prepareForUpgrade, searchForModules
} = require('../install/helpers.js');

function escapeSequence(...args) {
	var escapeSequence = "";
	
	for (var i = 0; i < args.length; i++) {
		escapeSequence += args[i] + "%s";
	}
	
	return escapeSequence;	
}

function askFor(prompt){
	return new Promise((success, reject) => {
		var rl = readline.createInterface(process.stdin, process.stdout);
		rl.setPrompt(prompt + ': ');
		rl.prompt();
		rl.on('line', function(line) {
			rl.close();
			success(line);
		});	
	});
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
				
					var dependencySkipMap = {};
					
					mods.forEach(localModule => {
						
						var remoteModule = moduleInfo[localModule.meta.moduleId + ''];
						
						// localModule can be identified in the wrong place - this happens when the .json file gets added to temporary bin files etc.
						// so, must check if the filesystem path is correct for the module.
						var idealModulePath = path.join(config.projectRoot, getModuleFilePath(remoteModule));
						
						if(idealModulePath != localModule.path){
							// Other unnecessary cached file.
							return;
						}
						
						// Do not install this if it is a dependency of some other module.
						dependencySkipMap[remoteModule.name.toLowerCase()] = true;
						
						if(remoteModule){
							if(localModule.meta.versionCode < remoteModule.latestVersionCode){
								
								if(!toUpgrade.find(i => i.id == remoteModule.id)){
									toUpgrade.push({remoteModule, localModule});
								}
							}
						}
						
					});
					
					if(toUpgrade.length != 0){
						
						console.log("Starting upgrade of " + toUpgrade.length + " modules.");
						
						var preparations = Promise.all(
							toUpgrade.map(localAndRemote => {
								var { remoteModule, localModule } = localAndRemote;
								
								// Will skip a module if it has local changes.
								return prepareForUpgrade(localAndRemote);
							})
						);
						
						return preparations.then(preparedModules => {
							
							// If any modules have local edits, ask for confirmation to do a partial upgrade.
							// Partial upgrades (omitting some modules from the update) can cause consistency issues if dependent modules are older than they should be.
							var localEdits = 0;
							
							for(var i=0;i<preparedModules.length;i++){
								var pm = preparedModules[i];
								
								if(pm.hasLocalEdits){
									localEdits++;
								}
							}
							
							var go = () => {
								return Promise.all(preparedModules.map(pm => {
									
									// Upgrade it:
									if(pm.upgradeable && !pm.hasLocalEdits){
										return replaceModule(pm.remoteModule, config, dependencySkipMap);
									}else{
										return Promise.resolve(true);
									}
									
								})).then(() => {
									console.log("Done.");
								});
							};
							
							if(localEdits){
								
								console.log('');
								
								console.log(
									localEdits +" module(s) with newer versions have been edited in this project and therefore won't be upgraded.\r\n" + 
									"You can continue to upgrade the rest of the modules but this can cause consistency issues if some modules are older than others. What would you like to do?"
								);
								
								// Future todo: "Note that if you'd like to force modules to update anyway, use the 'install UI/Example --force' command for each one. "
								
								console.log('');
								
								console.log("[N]othing. Stop there and don't do anything.");
								console.log("[A]ccept and upgrade everything except for the edited modules.");
								console.log("[L]ist the modules which have been identified as edited with a newer version available, then do nothing else and exit.");
								
								return askFor('enter N/A/L').then(userResponse => {
									var mode = userResponse.toLowerCase().trim();
									
									if(mode == 'a'){
										return go();
									}else if(mode == 'l'){
										
										console.log('');
								
										for(var i=0;i<preparedModules.length;i++){
											var pm = preparedModules[i];
											
											if(pm.hasLocalEdits){
												console.log(pm.remoteModule.name);
											}
										}
										
									}
									
								});
								
							}else{
								return go();
							}
							
						});
						
					}
					
				});
				
			}
			
		});
	});
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
