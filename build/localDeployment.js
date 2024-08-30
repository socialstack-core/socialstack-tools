const exec = require('child_process').exec;
const fs = require('fs').promises;
const path = require('path');

async function createDirectories(target, directories) {
	for(const dir of directories) {
		await fs.mkdir(path.join(target, dir), { recursive: true });
	}
}

async function rotateDirectories(target) {
	
	const deployDir = path.join(target, 'deploy');
	const prev2 = path.join(deployDir, 'prev-2');
	const prev1 = path.join(deployDir, 'prev-1');
	const prev = path.join(deployDir, 'prev');
	
	await fs.rm(prev2, { recursive: true, force: true });
	
	await moveDirectoryIgnoreIfNotFound(prev1, prev2);
	await moveDirectoryIgnoreIfNotFound(prev, prev1);
}

async function moveDirectoryIgnoreIfNotFound(src, target){
	// This is ok to fail quietly but only in the "not found" situation.
	try{
		await fs.rename(src, target);
	} catch (error) {
		if(error && error.code == 'ENOENT'){
			// A previous deployment didn't exist so there is nothing to move out of the way - this is fine.
			return;
		}
		throw error;
	}
}

async function writeFile(filePath, jsonString){
	await fs.writeFile(filePath, jsonString, 'utf8');
}

async function copyUIBundle(target, projectRoot, bundle){
	await moveDirectoryIgnoreIfNotFound(path.join(target, bundle + '/public'), path.join(target, 'deploy/prev/' + bundle + '/public'));
	await fs.cp(path.join(projectRoot, bundle + '/public'), path.join(target, bundle + '/public'), { recursive: true });
}

async function localDeployment(config){
	const { target } = config;
	
	console.log('Deploying locally to ' + target);
	
	// Ensure the main target directories exist:
	await createDirectories(target, [ 'Api', 'UI/public', 'Admin/public', 'Email/public', 'deploy' ]);
	
	// Rotate previous deploys out of the way:
	await rotateDirectories(target);
	
	// Create the new deploy directories:
	await createDirectories(target, [ 'deploy/prev', 'deploy/prev/UI', 'deploy/prev/Admin', 'deploy/prev/Email', 'bin/Api/build' ]);
	
	// Write new extension config, if there is one:
	if(config.appSettingsExtension){ // (just a json string)
		await writeFile(path.join(config.projectRoot, 'bin/Api/build/appsettings.extension.json'), config.appSettingsExtension);
	}
	
	// Move existing API deployment to backup location (if there wasn't one, this can fail safely) and cycle new one in:
	await moveDirectoryIgnoreIfNotFound(path.join(target, 'Api'), path.join(target, 'deploy/prev/Api'));
	await fs.rename(path.join(config.projectRoot, 'bin/Api/build'), path.join(target, 'Api'));
	
	// Move existing UI/Admin/Email bundle deployments to backup location and copy the new ones in:
	await copyUIBundle(target, config.projectRoot, 'UI');
	await copyUIBundle(target, config.projectRoot, 'Admin');
	await copyUIBundle(target, config.projectRoot, 'Email');
	
	// Restart the service if one is defined:
	if(config.restartService){
		
	console.log('Restarting service called "' + config.restartService + '"');
	
		await restartService(config.restartService);
	}
}

function restartService(serviceName){
	return new Promise((s, r)=>{
		exec('service ' + serviceName + ' restart',
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
			
			s();
		});
	});
}

module.exports = {localDeployment};