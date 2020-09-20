var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzipper');
var process = require('process');
var configManager = require('../configManager');
var exec = require('child_process').exec;

function installAllModules(modules, config, asSubModule, useHttps){
	
	var pendingInstall = installModule(modules[0], config, asSubModule, useHttps);
	
	for(var i=1;i<modules.length;i++){
		(function(index){
			var module = modules[index];
			pendingInstall = pendingInstall.then(() => {
				console.log("Installing module " + (index+1) + "/" + modules.length);
				return installModule(module, config, asSubModule, useHttps);
			});
		})(i);
	}
	
	return pendingInstall;
}

function uninstallAllModules(modules, config, asSubModule, useHttps){
	
	var pendingRemove = uninstallModule(modules[0], config, asSubModule, useHttps);
	
	for(var i=1;i<modules.length;i++){
		(function(index){
			var module = modules[index];
			pendingRemove = pendingRemove.then(() => {
				console.log("Uninstalling module " + (index+1) + "/" + modules.length);
				return uninstallModule(module, config, asSubModule, useHttps);
			});
		})(i);
	}
	
	return pendingRemove;
}

function deleteFolderRecursive(dirPath) {
	if(!dirPath || dirPath == '/'){
		return;
	}
  if (fs.existsSync(dirPath)) {
		fs.readdirSync(dirPath).forEach((file, index) => {
		var curPath = path.join(dirPath, file);
		if (fs.lstatSync(curPath).isDirectory()) { // recurse
			deleteFolderRecursive(curPath);
		} else { // delete file
			fs.unlinkSync(curPath);
		}
    });
    fs.rmdirSync(dirPath);
  }
};

function getHost(opts){
	var host = 'source.socialstack.dev';
	
	if(opts.repository){
		// Either a dns address, or an alias.
		// Look it up in alias lookup via config:
		var localCfg = configManager.getLocalConfig();
		
		if(localCfg && localCfg.repositories){
			var info = localCfg.repositories[opts.repository];
			if(info){
				if(typeof info == 'string'){
					host = info;
				}else if(info.host){
					host = info.host;
				}else{
					throw new Error('"' + opts.repository + '" is an alias in your repositories config, but it doesn\'t have a field called "host". This should be the DNS address of the repository.');
				}
				host = info.host;
			}else if(opts.repository.indexOf('.') != -1){
				host = opts.repository;
			}else{
				throw new Error('Didn\'t recognise "' + opts.repository + '" as either a repository alias or a DNS address. Check your repositories array in your tools config.');
			}
		}else if(opts.repository.indexOf('.') != -1){
			host = opts.repository;
		}else{
			throw new Error('Didn\'t recognise "' + opts.repository + '" as either a repository alias or a DNS address. Check your repositories array in your tools config.');
		}
	}
	
	return opts.https ? 'https://' + host : 'git@' + host;
}

function uninstallModule(moduleName, config){
	
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
		
		var fwdSlashes = moduleName.replace(/\./gi, '/');
		
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
			// It's a package:
			var packagePath = getHost({
				https: true,
				repository: repo,
				config
			}) + '/packages/' + fwdSlashes.toLowerCase() + '/raw/master/package.json';
			
			https.get(packagePath, function(res) {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});

				res.on("end", () => {
					try {
						let json = JSON.parse(body);
						if(json && json.dependencies && json.dependencies.length){
							
							uninstallAllModules(json.dependencies, config).then(success);
							
						}else{
							console.log("Warning: Empty or otherwise malformed package. Uninstalled nothing from it.");
						}
						return;
						
					} catch (error) {
						console.error(error.message);
					};
				});
			});
			
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
						
						// syncronous dir delete:
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

function installModule(moduleName, config, asSubModule, useHttps){
	return new Promise((success, reject) => {
		
		var repo = null;
		var colon = moduleName.indexOf(':');
		if(colon != -1){
			repo = moduleName.substring(0, colon);
			moduleName = moduleName.substring(colon+1);
		}
		
		var fwdSlashes = moduleName.replace(/\./gi, '/').replace(/\\/gi, '/');
		
		var moduleFilePath = (moduleName == 'project') ? '' : fwdSlashes;
		
		if(moduleFilePath.toLowerCase().indexOf('ui/') == 0){
			moduleFilePath = 'UI/Source/ThirdParty/' + moduleFilePath.substring(3);
		}else if(moduleFilePath.toLowerCase().indexOf('admin/') == 0){
			moduleFilePath = 'Admin/Source/ThirdParty/' + moduleFilePath.substring(6);
		}else if(moduleFilePath.toLowerCase().indexOf('email/') == 0){
			moduleFilePath = 'Email/Source/ThirdParty/' + moduleFilePath.substring(6);
		}else if(moduleFilePath.toLowerCase().indexOf('api/') == 0){
			moduleFilePath = 'Api/ThirdParty/' + moduleFilePath.substring(4);
		}else if(moduleFilePath != ''){
			// It's a package:
			var packagePath = getHost({
				https: true,
				repository: repo,
				config
			}) + '/packages/' + fwdSlashes.toLowerCase() + '/raw/master/package.json';
			
			https.get(packagePath, function(res) {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});

				res.on("end", () => {
					try {
						let json = JSON.parse(body);
						if(json && json.dependencies && json.dependencies.length){
							
							installAllModules(json.dependencies, config, asSubModule, useHttps).then(success);
							
						}else{
							console.log("Warning: Empty or otherwise malformed package. Installed nothing.");
						}
						return;
						
					} catch (error) {
						console.error(error.message);
					};
				});
			});
			
			return;
		}
		
		if(asSubModule){
			
			// Must've already authed with the source repo for this to be successful.
			var remotePath = 'modules/' + fwdSlashes.toLowerCase() + '.git';
			
			remotePath = getHost({
				https: useHttps,
				repository: repo,
				config
			}) + (useHttps ? '/' : ':') + remotePath;
			
			var attempt = 0;
			
			function tryGitPull(){
			
				exec(
					'git submodule add --force "' + remotePath + '" "' + moduleFilePath + '"', {
						cwd: config.projectRoot
					},
					function(err, stdout, stderr){
					
					if(err){
						
						attempt++;
						
						if(attempt<5){
							tryGitPull();
							return;
						}
						console.log(err);
					}else{
						if(stdout){
							// console.log(stdout);
						}
						
						if(attempt != 0){
							
							exec(
								'git reset --hard', {
									cwd: config.projectRoot + '/' + moduleFilePath
								},
								function(err, stdout, stderr){
									success();
								}
							);
							return;
						}
						
						if(stderr){
							console.log(stderr);
						}
					}
					
					success();
				});
			}
			
			tryGitPull();
			
		}else{
			
			// Make the dir:
			if(moduleFilePath != ''){
				// Recursive mkdir (catch if it exists):
				try{
					mkDirByPathSync(config.projectRoot + '/' + moduleFilePath);
				}catch(e){
					console.log(e);
					// console.log(moduleName + ' is already installed. You\'ll need to delete it if the goal was to overwrite it.');
					return success();
				}
				moduleFilePath = config.projectRoot + '/' + moduleFilePath + '/';
			}else{
				moduleFilePath = config.projectRoot + '/';
			}
			
			// Unzips whilst it downloads. There's no temporary file use here.
			
			// https://source.socialstack.cf/modules/project/-/archive/master/project-master.zip
			var repoName = moduleName.split('/');
			repoName = repoName[repoName.length-1].toLowerCase();
			
			var fromUrl = getHost({
				https: true,
				repository: repo,
				config
			}) + '/modules/' + fwdSlashes.toLowerCase() + '/-/archive/master/' + repoName + '-master.zip';
			
			https.get(fromUrl, function(response) {
				response.pipe(unzip.Parse()).on('entry', function (entry) {
					
					var pathParts = entry.path.split('/');
					pathParts.shift();
					var filePath = pathParts.join('/');
					
					if(entry.type == 'File'){
						mkDirByPathSync(moduleFilePath + path.dirname(filePath));
						entry.pipe(fs.createWriteStream(moduleFilePath + filePath));
					}else{
						mkDirByPathSync(moduleFilePath + filePath);
						entry.autodrain()
					}
					
				}).on('close', function() {
					success();
				});
			});
		}
		
	});
}

function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const sep = path.sep;
  targetDir = targetDir.replace(/\//gi, sep).replace(/\\/gi, sep);
  const initDir = path.isAbsolute(targetDir) ? sep : '';
  const baseDir = isRelativeToScript ? __dirname : '.';
  return targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir);
    try {
      fs.mkdirSync(curDir);
    } catch (err) {
      if (err.code === 'EEXIST') { // curDir already exists!
        return curDir;
      }

      // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
      if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
        throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
      }

      const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
      if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
        throw err; // Throw if it's just the last created dir.
      }
    }

    return curDir;
  }, initDir);
}

module.exports = {
	installModule,
	uninstallModule,
	mkDirByPathSync
};
