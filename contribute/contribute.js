var getAppDataPath = require('appdata-path');
var adp = getAppDataPath('socialstack');
var fs = require('fs');
var path = require('path');
var { runCmd } = require('../install/helpers.js');
var rimraf = require('rimraf');
var readline = require('readline');

var { 
	getModuleMap, getModuleIdMap, searchForModules,
	isModuleDifferentAndCorrect, getModuleFilePath,
	writeMeta
} = require('../install/helpers.js');

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

var escapeShell = function(cmd) {
  return '"'+cmd.replace(/(["'$`\\])/g,'\\$1')+'"';
};

function doContribute(moduleInfo, repoConfig, commitsToMake){
	
	var {localModule, remoteModule} = moduleInfo;
	
	if(localModule.meta.versionCode == remoteModule.latestVersionCode){
		// No merge required! Celebrations for all!
		console.log('');
		console.log(remoteModule.name + ' no merges required.');
		return askFor('Commit message for the changes made to "' + remoteModule.name + '" (or press enter to skip committing it)')
		.then(commitMessage => {
			
			if(!commitMessage || !commitMessage.length){
				return Promise.resolve(true);
			}
			
			commitsToMake.push({moduleInfo, commitMessage});
			return Promise.resolve(true);
		});
		
	}else{
		console.log('');
		console.log(remoteModule.name + ': Merge required! Somebody else has edited this same module.');
		console.log('In the future a branch will be made and your files copied to it, and then the merge can be automated. For now though you\'ll need to merge it yourself.');
		console.log('Your files: ' + localModule.path);
		console.log('A checkout of the socialstack module repo: ' + repoConfig.repoCheckout);
		console.log('');
		return Promise.resolve(true);
	}
	
	
}

function applyCommit(commitInfo, repoConfig){
	var {moduleInfo, commitMessage} = commitInfo;
	var {localModule, remoteModule} = moduleInfo;
	
	// Delete all the files in the repo checkout, then copy all the files from the localModule.path directory.
	var target = path.join(repoConfig.repoCheckout, remoteModule.path);
	var src = localModule.path;
	var gitConfig = {projectRoot: repoConfig.repoCheckout};
	
	return rimraf(target)
	.then(() => {
		copyRecursiveSyncExceptForModuleJson(src, target, 0);
		
		// Commit this directory.
		return runCmd('git add -A "' + remoteModule.path + '"', gitConfig)
			.then(() => {
				return runCmd('git commit -m ' + escapeShell(remoteModule.name + ': ' +commitMessage) + ' "' + remoteModule.path + '"', gitConfig)
			})
			.then(() => {
				return runCmd('git log -n 1 --pretty="format:%H %ct"', gitConfig)
				.then(hashAndCommitTime => {
					var parts = hashAndCommitTime.trim().split(' ');
					var hash = parts[0];
					var ct = parseInt(parts[1]);
					
					// Can now update the local meta. The version code is in ticks / 10000, so must convert the time to ticks first:
					var latestVersionCode = 62135596800000 + (ct * 1000);
					
					var meta = {...remoteModule, latestVersionCode, latestHash: hash};
					writeMeta(src, meta);
				});
			});
		
	});
	
}

/**
 * Look ma, it's cp -R.
 * @param {string} src  The path to the thing to copy.
 * @param {string} dest The path to the new copy.
 */
var copyRecursiveSyncExceptForModuleJson = function(src, dest, depth) {
  var exists = fs.existsSync(src);
  var stats = exists && fs.statSync(src);
  var isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest);
    fs.readdirSync(src).forEach(function(childItemName) {
		if(depth == 0 && childItemName == 'module.installer.json'){
			// Don't copy this
			return;
		}
		
        copyRecursiveSyncExceptForModuleJson(path.join(src, childItemName),
                        path.join(dest, childItemName), depth+1);
    });
  } else {
    fs.copyFileSync(src, dest);
  }
};

module.exports = (config) => {
	
	var repoCheckout = adp + '/repositories/1';
	
	fs.mkdir(repoCheckout, { recursive: true }, (err) => {
		
		if (err && err.code != 'EEXIST') throw err;
		
		var repoExists = null;
		
		try{
			repoExists = fs.statSync(repoCheckout + '/.git');
		}catch{
		}
		
		var setupPromise = null;
		
		if(repoExists == null || !repoExists.isDirectory()){
			
			console.log("Looks like this is the first time - thank you! Cloning the main repository..");
			setupPromise = runCmd('git clone https://github.com/socialstack-core/modules.git/ "' + repoCheckout + '"', config);
			
		}else{
			
			console.log("Pulling the main repository..");
			setupPromise = runCmd('git pull', {projectRoot: repoCheckout});
			
		}
		
		setupPromise.then(() => {
			
			// Next, discover all locally modified modules.
			// Future todo is also identifying new directories in ThirdParty in order to contribute them.
			console.log('Collecting the installed modules in your project..');
			return getModuleMap();
		})
		.then(moduleInfo => {
			return getModuleIdMap();
		})
		.then(moduleInfo => {
			
			var mods = [];
			searchForModules(config.projectRoot, mods);
			
			console.log('Checking which of the ' + mods.length + ' installed modules have local changes..');
			
			var proms = mods.map(localModule => {
				
				var remoteModule = moduleInfo[localModule.meta.moduleId + ''];
				
				// localModule can be identified in the wrong place - this happens when the .json file gets added to temporary bin files etc.
				// so, must check if the filesystem path is correct for the module.
				var idealModulePath = path.join(config.projectRoot, getModuleFilePath(remoteModule));
				
				if(idealModulePath != localModule.path || !remoteModule){
					// Other unnecessary cached file.
					return null;
				}
				
				var localModulePath = localModule.path;
				
				return isModuleDifferentAndCorrect({localModule, remoteModule}).then(isDifferent => {
					
					return {localModule, remoteModule, isDifferent};
					
				});
			});
			
			return Promise.all(proms);
		}).then(modules => {
			// the local version can actually be higher than the latest if it was literally just updated.
			var changedModules = modules.filter(mod => mod && mod.isDifferent && mod.localModule.meta.versionCode <= mod.remoteModule.latestVersionCode);
			
			if(!changedModules.length){
				console.log('No changes have been identified on your thirdparty modules. If you\'d like to contribute a new module, you\'ll currently need to create a new module entry on socialstack cloud and then push your code to the repository.');
				console.log("A checkout of the public repository has been made here: " + repoCheckout);
				return;
			}
			
			console.log(changedModules.length + ' module(s) have been changed from the installed version. Now we hope you don\'t have to merge! May the odds be ever in your favour.');
			
			var repoConfig = {
				repoCheckout,
				config
			};
			
			// Which of them have newer remote versions? The ones which don't can be copied into the checkout and directly committed.
			// When this happens, the commit hash and commit time should then be applied to the meta file.
			var commitsToMake = [];
			
			var prom = doContribute(changedModules[0], repoConfig, commitsToMake);
			
			for(var i=1;i<changedModules.length;i++){
				((indx) => {
					prom = prom.then(() => doContribute(changedModules[indx], repoConfig, commitsToMake));
				})(i);
			}
			
			return prom.then(() => {
				
				if(commitsToMake.length){
					console.log('Executing ' + commitsToMake.length + ' commit(s)');
					
					// Apply them all together now. This helps minimise the risk of somebody exiting during the contribute flow and leaving modules partially committed.
					var prom = applyCommit(commitsToMake[0], repoConfig);
					
					for(var i=1;i<commitsToMake.length;i++){
						((indx) => {
							prom = prom.then(() => applyCommit(commitsToMake[indx], repoConfig));
						})(i);
					}
					
					return prom;
				}
			})
			.then(() => {
				
				console.log('');
				console.log('All contributions completed. Please go to the repo checkout, sanity check the log, and then push:');
				console.log(repoCheckout);
				console.log('');
				console.log('Thank you!');
				
			});
		}).then(() => {
			
			/*
			console.log("- Automated contribution available shortly! -");
			console.log("");
			console.log("A checkout has been made here: " + repoCheckout);
			console.log("Committing to this repository and pushing will then allow people to upgrade to pull in your changes.");
			*/
			
		});
		
	});
	
};