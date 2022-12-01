var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzipper');
var process = require('process');
var configManager = require('../configManager');
var exec = require('child_process').exec;
var getAppDataPath = require('appdata-path');
var adp = getAppDataPath('socialstack');

var moduleRepository = 'cloud.socialstack.dev';

var mainstreamRepos = {};

mainstreamRepos['npm'] = {
	cmd: 'npm install "{NAME_URL}" --save'
};

mainstreamRepos['nuget'] = {
	cmd: 'dotnet add package "{NAME_NO_VERSION}"'
};

// Returns zip file stream
function getOrCacheZip(moduleMeta){
	
	var moduleCache = adp + '/module_cache';
	
	return new Promise((success, reject) => {
		
		var moduleCachePath = moduleCache + '/' + moduleMeta.id;
		
		fs.mkdir(moduleCachePath, { recursive: true }, (err) => {
			if (err && err.code != 'EEXIST') throw err;
			
			var zipPath = '/' + moduleMeta.latestVersionCode + '.zip';
			
			var readStream = fs.createReadStream(moduleCachePath + zipPath);
			
			// This will wait until we know the readable stream is actually valid before piping
			readStream.on('open', function () {
				success(readStream);
			});
			
			readStream.on('error', function(err) {
				// Doesn't exist in cache.
				var url = 'https://' + moduleRepository + '/content/modules/' + moduleMeta.id + zipPath;
				
				https.get(url, function(response) {
					
					if(response.statusCode == 200 && response.headers['content-type'] == 'application/zip'){
						
						var cacheWriteStream = fs.createWriteStream(moduleCachePath + zipPath);
						
						response.pipe(cacheWriteStream);
						
						cacheWriteStream.on('finish', () => {
							
							// try opening again:
							readStream = fs.createReadStream(moduleCachePath + zipPath);
							
							readStream.on('open', function () {
								success(readStream);
							});
							
							readStream.on('error', function(err) {
								console.log(err);
								reject("Invalid cache i/o.");
							});
						});
					}
					else
					{
						reject("Invalid response from module service (" + url + ")");
					}
				});
				
			});
		});
		
	});
	
}

// Simply deletes the directory
function uninstallModules(modules, config){
	
	return new Promise((success, reject) => {
		
		var projectRoot = path.normalize(config.projectRoot);
		
		modules.forEach(module => {
			
			// Get the file path:
			var modulePath = getModuleFilePath({name: module});
			
			if(modulePath){
				
				// Sync folder delete:
				if(!deleteFolderRecursive(projectRoot + '/' + modulePath)){
					console.log("Can't uninstall '" + module + "' because it doesn't exist in this project (skipping)");
				}
			}
			
		});
		
		success();
	});
	
}

// Uses metadata from module info to obtain the correct module zip
function installSingleModuleInternal(moduleMeta, moduleFilePath, config, addMeta){
	console.log('Installing ' + moduleMeta.name);
	
	// Does the zip exist in the local cache?
	return getOrCacheZip(moduleMeta).then(zipStream => {
		
		// zipstream is coming from the cache.
		
		return new Promise((success, reject) => {
		
			// If the module path exists, delete it.
			if (addMeta) {
				deleteFolderRecursive(moduleFilePath);
			}
			
			mkDirByPathSync(moduleFilePath);
			
			zipStream.pipe(unzip.Parse()).on('entry', function (entry) {
				
				
				if(entry.type == 'File'){
					
					mkDirByPathSync(moduleFilePath + path.dirname(entry.path));
					entry.pipe(fs.createWriteStream(moduleFilePath + entry.path));
				}else{
					mkDirByPathSync(moduleFilePath + entry.path);
					entry.autodrain()
				}
				
			}).on('close', function() {
				success();
			});
			
		});
		
	})
	.then(() => {
		// Add the meta file.
		if(addMeta){
			
			fs.writeFileSync(
				moduleFilePath + 'module.installer.json',
				'{"repository": ' + moduleMeta.repositoryId + ', "moduleId": ' + moduleMeta.id + ', "versionCode": ' + moduleMeta.latestVersionCode + '}'
			);
			
		}
	}).then(() => {
		
		return installDependencies(moduleFilePath, config);
		
	});
}

var _memCachedModuleList = null;
function getModuleList(){
	// Future todo: Cache response and ask for changes since {time}
	
	if(_memCachedModuleList){
		return Promise.resolve(_memCachedModuleList);
	}
	
	return new Promise((success, reject) => {
		
		https.get('https://' + moduleRepository + '/v1/module/list', function(res) {
			
			var bodyResponse = [];
			res.on('data', (d) => {
				bodyResponse.push(d);
			});

			res.on('end', () => {
				var jsonResp = bodyResponse.join('');
				var json = JSON.parse(jsonResp);
				_memCachedModuleList = json;
				success(json);
			});
			
		});
		
	});
	
}

function getModuleMap(){
	return getModuleList()
	.then(res => {
		
		// Module results:
		var moduleInfo = {};
		
		res.results.forEach(moduleMeta => {
			
			if(moduleMeta.latestVersionCode){
				moduleInfo[moduleMeta.name.toLowerCase()] = moduleMeta;
			}
			
		});
		
		return moduleInfo;
	});
}

function replaceModule(moduleMeta, config){
	return installSingleModule(moduleMeta, config);
}

function getModuleIdMap(){
	return getModuleList()
	.then(res => {
		
		// Module results:
		var moduleInfo = {};
		
		res.results.forEach(moduleMeta => {
			
			if(moduleMeta.latestVersionCode){
				moduleInfo[moduleMeta.id + ''] = moduleMeta;
			}
			
		});
		
		return moduleInfo;
	});
}

function installModules(modules, config){
	
	// Lookup module names:
	if(!modules || !modules.length){
		throw new Error('No module names specified');
	}
	
	return getModuleMap()
	.then(moduleInfo => {
		
		var projectRoot = path.normalize(config.projectRoot);
		
		return Promise.all(
			modules.map(name => {
				
				var repo = null;
				var colon = name.indexOf(':');
				if(colon != -1){
					repo = name.substring(0, colon);
					name = name.substring(colon+1);
				}
				
				if(repo){
					
					if(!mainstreamRepos[repo.toLowerCase()]){
						throw new Error("Unknown module repository reference: '" + repo + "'");
					}
					
					// Host is a mainstream repository:
					var repoMeta = mainstreamRepos[repo.toLowerCase()];
					
					var modulePath = name;
					
					if(modulePath[0] == '/'){
						modulePath = modulePath.substring(1);
					}
					
					if(modulePath[modulePath.length-1] == '/'){
						modulePath = modulePath.substring(0, modulePath.length-1);
					}
					
					// Split into pieces:
					var pathParts = modulePath.split('/');
					
					// Repo name:
					var localName = pathParts[pathParts.length-1];
					
					// Name lowercase:
					var nameUrl = localName.toLowerCase();
					
					// Path lowercase:
					var moduleUrl = modulePath.toLowerCase();
					
					var nameNoVersion = localName;
					
					var verStart = nameNoVersion.indexOf('@');
					
					if(verStart != -1){
						nameNoVersion = localName.substring(0, verStart);
					}
					
					console.log("Installing dependency " + name + "..");
					
					return cmdInstall(
						repoMeta.cmd
							.replace(/\{MODULE\}/g, modulePath)
							.replace(/\{MODULE_URL\}/g, moduleUrl)
							.replace(/\{NAME\}/g, localName)
							.replace(/\{NAME_NO_VERSION\}/g, nameNoVersion)
							.replace(/\{NAME_URL\}/g, nameUrl),
						config
					);
				}
				
				var nameLC = name.toLowerCase();
				var info = moduleInfo[nameLC];
				
				if(!info){
					return Promise.reject("Module doesn't exist: " + name);
				}
				
				var projectRelativePath = getModuleFilePath(info);
				var moduleFilePath = projectRoot + '/';
				var addMeta = false;
				
				if(projectRelativePath){
					// Project template otherwise
					moduleFilePath += projectRelativePath + '/';
					addMeta = true;
				}
				
				return installSingleModuleInternal(info, moduleFilePath, config, addMeta);
			})
		);
		
	});
}

function installSingleModule(info, config){
	var projectRoot = path.normalize(config.projectRoot);
	var projectRelativePath = getModuleFilePath(info);
	var moduleFilePath = projectRelativePath ? projectRoot + '/' + projectRelativePath + '/' : projectRoot + '/';
	return installSingleModuleInternal(info, moduleFilePath, config, projectRelativePath);
}

function deleteFolderRecursive(dirPath) {
	if(!dirPath || dirPath == '/'){
		return false;
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
	return true;
  }
  
  return false;
};

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
function installDependencies(moduleFilePath, config){
	
	return new Promise((success, reject) => {
	
		fs.readFile(moduleFilePath + 'package.json', {encoding: 'utf8'}, (err, content) => {
			if(err){
				// No package.json file - skip:
				success();
				return;
			}
			
			// parse:
			try{
				var pkg = JSON.parse(content);
				
				var pendingPromises = [];
				
				if(pkg && Array.isArray(pkg.dependencies)){
					
					pendingPromises.push(
						installModules(pkg.dependencies, config)
					);
					
				}
				
				if(pkg.scripts && pkg.scripts.install){
					// Exec the install script by require()'ing it.
					try{
						console.log("Running the module's install script..");
						var installScriptPath = moduleFilePath + pkg.scripts.install;
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
				Promise.all(pendingPromises).then(success).catch(reject);
				
			}catch(e){
				reject(moduleFilePath + ' has an invalid package.json - here\'s the error:' + e);
			}
		});
	});
	
}

function cmdInstall(cmd, config){
	
	return runCmd(cmd, config).catch(e => {
		console.log("[!] Unable to install a dependency. Attempted to run the following command:");
		console.log('');
		console.log(cmd);
		console.log('');
		console.log("The error was as follows", e);
		console.log("Continuing to install other dependencies");
	});
	
}

function getModuleFilePath(moduleMeta){
	
	if(moduleMeta.name == 'Project'){
		// Special case - project template module.
		return '';
	}
	
	// Note that we use .name rather than .path here as the path is where it is in the actual source repo.
	var fwdSlashes = tidyModuleName(moduleMeta.name);
	var moduleFilePath = fwdSlashes;
	
	if(moduleFilePath.toLowerCase().indexOf('ui/') == 0){
		moduleFilePath = 'UI/Source/ThirdParty/' + moduleFilePath.substring(3);
	}else if(moduleFilePath.toLowerCase().indexOf('admin/') == 0){
		moduleFilePath = 'Admin/Source/ThirdParty/' + moduleFilePath.substring(6);
	}else if(moduleFilePath.toLowerCase().indexOf('email/') == 0){
		moduleFilePath = 'Email/Source/ThirdParty/' + moduleFilePath.substring(6);
	}else if(moduleFilePath.toLowerCase().indexOf('api/') == 0){
		moduleFilePath = 'Api/ThirdParty/' + moduleFilePath.substring(4);
	}
	
	return moduleFilePath;
}

/*

function postJson(url, body){
	
	return new Promise((success, reject) => {
		
		var postData = JSON.stringify(body);
		
		var options = {
		  hostname: moduleRepository,
		  port: 443,
		  path: '/' + url,
		  method: 'POST',
		  headers: {
			   'Content-Type': 'application/json',
			   'Content-Length': postData.length
			 }
		};

		var req = https.request(options, (res) => {
		  var bodyResponse = [];
		  res.on('data', (d) => {
			  bodyResponse.push(d);
		  });
		  
		  res.on('end', () => {
			  
			  var jsonResp = bodyResponse.join('');
			  var json = JSON.parse(jsonResp);
			  
			  success(json);
		  });
		});

		req.on('error', (e) => {
		  console.error(e);
		});

		req.write(postData);
		req.end();
	});
	
}

*/

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
	installModules,
	uninstallModules,
	installSingleModule,
	deleteFolderRecursive,
	getModuleFilePath,
	runCmd,
	tidyModuleName,
	replaceModule,
	getOrCacheZip,
	getModuleList,
	getModuleMap,
	getModuleIdMap,
	mkDirByPathSync
};
