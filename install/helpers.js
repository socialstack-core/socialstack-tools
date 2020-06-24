var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzipper');
var process = require('process');
var configManager = require('../configManager');
var exec = require('child_process').exec;

// The repo is https only, because it's (at least) 2019.
var sourceHostGit = configManager.getLocalConfig().sourceRepoGit || 'git@source.socialstack.cf';
var sourceHostHttps = configManager.getLocalConfig().sourceRepoHttps || 'https://source.socialstack.cf';

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

function installModule(moduleName, config, asSubModule, useHttps){
	return new Promise((success, reject) => {
		
		var fwdSlashes = moduleName.replace(/\./gi, '/');
		
		var moduleFilePath = (moduleName == 'project') ? '' : fwdSlashes;
		
		if(moduleFilePath.toLowerCase().indexOf('ui/') == 0){
			moduleFilePath = 'UI/Source/ThirdParty/' + moduleFilePath.substring(3);
		}else if(moduleFilePath.toLowerCase().indexOf('admin/') == 0){
			moduleFilePath = 'Admin/Source/ThirdParty/' + moduleFilePath.substring(6);
		}else if(moduleFilePath.toLowerCase().indexOf('api/') == 0){
			moduleFilePath = 'Api/ThirdParty/' + moduleFilePath.substring(4);
		}else if(moduleFilePath != ''){
			// It's a package:
			var packagePath = sourceHostHttps + '/packages/' + fwdSlashes.toLowerCase() + '/raw/master/package.json';
			
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
			
			if(useHttps){
				remotePath = sourceHostHttps + '/' + remotePath;
			}else{
				remotePath = sourceHostGit + ':' + remotePath;
			}
			
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
			
			var fromUrl = sourceHostHttps + '/modules/' + fwdSlashes.toLowerCase() + '/-/archive/master/' + repoName + '-master.zip';
			
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
	mkDirByPathSync
};
