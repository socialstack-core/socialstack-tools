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

var mainstreamRepos = {};

mainstreamRepos['npm'] = {
	cmd: 'npm install "{NAME_URL}" --save'
};

mainstreamRepos['nuget'] = {
	cmd: 'dotnet add package "{NAME_NO_VERSION}"'
};

function getRepositoryUrl(opts){
	
	// Note: if you change this, please also update the example in the repo:
	// https://source.socialstack.dev/documentation/guide/blob/master/DeveloperGuide/Commands/repo-description.json
	var defaultHost = {
		git: {
			url: 'git@source.socialstack.dev:',
			modules: {
				'*': '{URL}modules/{MODULE_URL}.git'
			}
		},
		https: {
			url: 'https://source.socialstack.dev/',
			modules: {
				'*': '{URL}modules/{MODULE_URL}.git'
			},
			packages: {
				'*':  '{URL}packages/{MODULE_URL}/raw/master/package.json'
			},
			archives: {
				'*': '{URL}modules/{MODULE_URL}/-/archive/master/{NAME_URL}-master.zip'
			}
		}
	};
	
	var host = defaultHost;
	
	if(opts.repository){
		
		host = null;
		// Either a dns address, or an alias.
		// Look it up in alias lookup via config:
		var localCfg = configManager.getLocalConfig();
		
		if(localCfg && localCfg.repositories){
			host = localCfg.repositories[opts.repository];
		}
		
		if(!host){
			console.log(defaultHost);
			throw new Error(
				'Didn\'t recognise "' + opts.repository + '" as a repository alias. '+
				'Check your "repositories" array in your tools config. As an example, the default one is above.'
			);
		}
	}
	
	if(host.remote){
		if(host._cached){
			hostPromise = Promise.resolve(host._cached);
		}else{
			console.log('Getting repository information..');
			hostPromise = getRemoteJson(host.remote).then(hostData => {
				host._cached = hostData;
				return hostData;
			});
		}
		
	}else{
		hostPromise = Promise.resolve(host);
	}
	
	return hostPromise
		.then(host => {
		
		host = opts.https ? host.https : host.git;
		
		if(!host){
			console.log(defaultHost);
			throw new Error(
				'Host "' + (opts.repository || '{default}') + '" exists but it doesn\'t have config for ' + (opts.https ? 'https' : 'git') + '.' + 
				' As an example, the default one is above.'
			);
		}
		
		if(!host.url){
			console.log(defaultHost);
			throw new Error(
				'"' + opts.repository + '" has repository config, but it doesn\'t have a "url".' + 
				' As an example, the default one is above.'
			);
		}
		
		var url = host.url;
		
		var modulePath = opts.modulePath || opts.packagePath || opts.archivePath;
		
		if(modulePath){
			
			if(modulePath[0] == '/'){
				modulePath = modulePath.substring(1);
			}
			
			if(modulePath[modulePath.length-1] == '/'){
				modulePath = modulePath.substring(0, modulePath.length-1);
			}
			
			// Split into pieces:
			var pathParts = modulePath.split('/');
			
			// Repo name:
			var name = pathParts[pathParts.length-1];
			
			// Name lowercase:
			var nameUrl = name.toLowerCase();
			
			// Path lowercase:
			var moduleUrl = modulePath.toLowerCase();
			
			// Patterns to use when figuring out the path to the module:
			var patternsName = '';
			
			if(opts.modulePath){
				patternsName = 'modules';
			}else if(opts.packagePath){
				patternsName = 'packages';
			}else{
				patternsName = 'archives';
			}
			
			var urlPatterns = host[patternsName];
			
			if(!urlPatterns) {
				console.log(defaultHost);
				throw new Error(
					'"' + opts.repository + '" has repository config but it doesn\'t support ' + patternsName + ' via ' + (opts.https ? 'https' : 'git') + '.' +
					' As an example, the default one is above.'
				);
			}
			
			// Use the most specific pattern available. They are all "starts with", or a wildcard, and always lowercase.
			// "api": ..
			// "ui/functions": ..
			// "*": ..
			
			var patternToUse = urlPatterns['*'];
			
			for(var len = pathParts.length-1; len>=0;len--){
				
				var checkForPattern = pathParts.join('/').toLowerCase();
				pathParts.pop();
				if(urlPatterns[checkForPattern]){
					patternToUse = urlPatterns[checkForPattern];
					break;
				}
				
			}
			
			var builtStr = patternToUse
				.replace(/\{URL\}/g, host.url)
				.replace(/\{MODULE\}/g, modulePath)
				.replace(/\{MODULE_URL\}/g, moduleUrl)
				.replace(/\{NAME\}/g, name)
				.replace(/\{NAME_URL\}/g, nameUrl);
			
			return builtStr;
		}
		
		return url;
	});
}

function tidyModuleName(moduleName){
	
	// Api.Thing -> Api/Thing except for .Bundle which remains as-is.
	var bundle = false;
	
	if(moduleName.toLowerCase().endsWith('.bundle')){
		bundle = moduleName.substring(moduleName.length - 7);
		moduleName = moduleName.substring(0,moduleName.length - 7);
	}
	
	var noDots = moduleName.replace(/\./gi, '/').replace(/\\/gi, '/');
	
	if(bundle){
		noDots += bundle;
	}
	
	return noDots;
	
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
			// It's a package:
			getRepositoryUrl({
				https: true,
				repository: repo,
				config,
				packagePath: fwdSlashes
			})
			.then(packagePath => getRemoteJson(packagePath))
			.then(json => {
				if(json && json.dependencies && json.dependencies.length){
					
					uninstallAllModules(json.dependencies, config).then(success);
					
				}else{
					console.log("Warning: Empty or otherwise malformed package. Uninstalled nothing from it.");
				}
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

function getRemoteJson(url){
	// get json from given url
	return new Promise((success, rej) => {
		https.get(url, function(res) {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});

			res.on("end", () => {
				try {
					let json = JSON.parse(body);
					return success(json);
				} catch (error) {
					console.error(error.message);
				};
			});
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
* Attempts to install dependencies for the given module path, 
*/
function installDependencies(moduleFilePath, config, onDone){
	fs.readFile(config.projectRoot + '/' + moduleFilePath + '/package.json', {encoding: 'utf8'}, (err, content) => {
		if(err){
			// No package.json file - skip:
			onDone();
		}else{
			// parse:
			try{
				var pkg = JSON.parse(content);
				
				var pendingPromises = [];
				
				if(pkg && Array.isArray(pkg.dependencies)){
					
					pendingPromises.push(
						installAllModules(pkg.dependencies, config, true, true)
					);
					
				}
				
				if(pkg.scripts && pkg.scripts.install){
					// Exec the install script by require()'ing it.
					try{
						console.log("Running the module's install script..");
						var installScriptPath = config.projectRoot + '/' + moduleFilePath + '/' + pkg.scripts.install;
						var installScript = require(installScriptPath);
						
						if(typeof installScript === "function"){
							// Invoke it. It can optionally return a promise.
							var promise = installScript(config, {
								install: module.exports,
								configManager,
								unzip
							}, moduleFilePath);
							
							if(promise){
								pendingPromises.push(promise);
							}
						}
						
					}catch(e){
						console.log('Skipping a failed install script.');
						console.log('This is likely not an issue with Socialstack tools and instead came from ' + installScriptPath + " which was referenced from the package.json");
						console.log(e);
					}
				}
				
				// Wait for the pending promises then continue:
				Promise.all(pendingPromises).then(() => onDone());
				
			}catch(e){
				console.log(moduleFilePath + ' has an invalid package.json - here\'s the error:', e);
			}
		}
	});
}

function cmdInstall(cmd, config, success){
	
	return runCmd(cmd, config).then(success).catch(e => {
		console.log("[!] Unable to install a dependency. Attempted to run the following command:");
		console.log('');
		console.log(cmd);
		console.log('');
		console.log("The error was as follows", e);
		console.log("Continuing to install other dependencies");
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
		
		if(repo && mainstreamRepos[repo.toLowerCase()]){
			
			// Host is a mainstream repository:
			var repoMeta = mainstreamRepos[repo.toLowerCase()];
			
			if(repoMeta.cmd){
				console.log(moduleName);
				var modulePath = moduleName;
				
				if(modulePath[0] == '/'){
					modulePath = modulePath.substring(1);
				}
				
				if(modulePath[modulePath.length-1] == '/'){
					modulePath = modulePath.substring(0, modulePath.length-1);
				}
				
				// Split into pieces:
				var pathParts = modulePath.split('/');
				
				// Repo name:
				var name = pathParts[pathParts.length-1];
				
				// Name lowercase:
				var nameUrl = name.toLowerCase();
				
				// Path lowercase:
				var moduleUrl = modulePath.toLowerCase();
				
				var nameNoVersion = name;
				
				var verStart = nameNoVersion.indexOf('@');
				
				if(verStart != -1){
					nameNoVersion = name.substring(0, verStart);
				}
				
				return cmdInstall(
					repoMeta.cmd
						.replace(/\{MODULE\}/g, modulePath)
						.replace(/\{MODULE_URL\}/g, moduleUrl)
						.replace(/\{NAME\}/g, name)
						.replace(/\{NAME_NO_VERSION\}/g, nameNoVersion)
						.replace(/\{NAME_URL\}/g, nameUrl),
					config,
					success
				);
			}
			
			return;
		}
		
		var fwdSlashes = tidyModuleName(moduleName);
		
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
			getRepositoryUrl({
				https: true,
				repository: repo,
				config,
				packagePath: fwdSlashes
			})
			.then(packagePath => getRemoteJson(packagePath))
			.then(json => {
				if(json && json.dependencies && json.dependencies.length){
					
					installAllModules(json.dependencies, config, asSubModule, useHttps).then(success);
					
				}else{
					console.log("Warning: Empty or otherwise malformed package. Installed nothing.");
				}
			});
			
			return;
		}
		
		if(asSubModule){
			
			// Must've already authed with the source repo for this to be successful.
			
			var attempt = 0;
			
			function tryGitPull(remotePath){
			
				exec(
					'git submodule add -b master --force "' + remotePath + '" "' + moduleFilePath + '"', {
						cwd: config.projectRoot
					},
					function(err, stdout, stderr){
						if(err){
							
							/*
							if(err.code && err.code == 128){
								console.log("[FAILED] Module doesn't exist at the remote repository. Tried url: " + remotePath);
								reject("Module doesn't exist");
								return;
							}
							*/
							
							attempt++;
							
							if(attempt<5){
								tryGitPull(remotePath);
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
						
						// If package.json exists, install dependencies too.
						installDependencies(moduleFilePath, config, () => {
							success();
						});
					}
				);
			}
			
			getRepositoryUrl({
				https: useHttps,
				repository: repo,
				config,
				modulePath: fwdSlashes
			})
			.then(remotePath => tryGitPull(remotePath));
			
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
			
			getRepositoryUrl({
				https: true,
				repository: repo,
				config,
				archivePath: fwdSlashes
			}).then(fromUrl => {
				
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
