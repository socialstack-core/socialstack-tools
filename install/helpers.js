var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzip');
var process = require('process');
var configManager = require('../configManager');
var exec = require('child_process').exec;

// The repo is https only, because it's (at least) 2019.
var repoHost = configManager.getLocalConfig().repository || 'https://modules.socialstack.cf';
var sourceHostGit = configManager.getLocalConfig().sourceRepoGit || 'git@source.socialstack.cf';
var sourceHostHttps = configManager.getLocalConfig().sourceRepoHttps || 'https://source.socialstack.cf';

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
		}
		
		if(asSubModule){
			
			// Must've already authed with the source repo for this to be successful.
			var remotePath = 'modules/' + fwdSlashes.toLowerCase() + '.git';
			
			if(useHttps){
				remotePath = sourceHostHttps + '/' + remotePath;
			}else{
				remotePath = sourceHostGit + ':' + remotePath;
			}
			
			exec(
				'git submodule add --force "' + remotePath + '" "' + moduleFilePath + '"', {
					cwd: config.projectRoot
				},
				function(err, stdout, stderr){
				
				if(err){
					console.log(err);
				}else{
					if(stdout){
						console.log(stdout);
					}
					if(stderr){
						console.log(stderr);
					}
				}
				
				success();
			});
			
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
			var fromUrl = repoHost + '/content/latest/' + fwdSlashes + '.zip';
			
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
