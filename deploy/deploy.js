var { remoteFileList, localFileList,diff, copyDirectory, uploadFile, createRemoteDirectory, extractPatch, setPermsAndUser, restartService } = require('./helpers.js');
var hostHelpers = require('../host/helpers.js');
var buildHelpers = require('../build/helpers.js');
const tmp = require('tmp');
const tar = require('tar');
const path = require('path');

module.exports = config => {
	
	if(config.commandLine['h'] || config.commandLine['host']){
		
		// target host is..
		var host = config.commandLine['h'] || config.commandLine['host'];
		var commit = config.commandLine['commit'];
		var verbose = config.commandLine['v'] || config.commandLine['verbose'];
		var build = config.commandLine['build'];
		
		if(!commit){
			console.log('DRY RUN');
			console.log('Attempting to connect to the host and establish the file changes');
			console.log('Files will *not* be changed on the remote host. Use the -commit flag to actually apply changes.');
		}
		
		host = host[0];
		
		var buildPromise = build ? buildHelpers.buildAll({prod: true}, config) : Promise.resolve(true);
		
		// Wait for build:
		buildPromise
		// Connect to the host:
		.then(() => hostHelpers.connect(host))
		.then(connection => {
			
			var hostInfo = connection.hostInfo;
			
			var backupDir = hostInfo.remoteDir + '/deploy/backups/' + Date.now() + '/'; 
			var patchDir = hostInfo.remoteDir + '/deploy/patches/' + Date.now() + '/'; 
		
			console.log('Connected to host - calculating patch');
			
			var fileSets = [
				{name: 'UI', local:'UI/public', remote: 'UI/public', onlyRemoveFrom: 'pack/'}, // Won't delete stuff from anywhere other than the pack directory.
				{name: 'Admin', local:'Admin/public', remote: 'Admin/public', onlyRemoveFrom: 'pack/'},
				{local:'bin/Api/build', remote: 'Api'} // Has total ownership of the remote Api directory
			];
			
			var perms = 775;
			var user = hostInfo.serverUser || 'www-data';
			
			// STAGE 1 - Gather the patches
			var setPromises = fileSets.map(fileSet => {
				
				return Promise.all([
					remoteFileList(hostInfo.remoteDir + '/' + fileSet.remote, connection),
					localFileList(config.projectRoot + '/' + fileSet.local).catch(e => {
						// Local dir does not exist - this set will be ignored.
						console.log(config.projectRoot + '/' + fileSet.local + ' does not exist so this file set will not be deployed.');
						
						return null;
					})
				]).then(remoteAndLocal => {
					
					var remoteFiles = remoteAndLocal[0];
					var localFiles = remoteAndLocal[1];
					
					if(localFiles == null){
						return null;
					}
					
					// Calculate the patch:
					var patch = diff(remoteFiles, localFiles);
					
					if(fileSet.onlyRemoveFrom){
						// Removed files must start with the given text:
						patch.removed = patch.removed.filter(removed => removed.path.startsWith(fileSet.onlyRemoveFrom));
					}
					
					console.log('Patch: + ' + patch.added.length + ', * ' + patch.updated.length + ', - ' + patch.removed.length);
					
					if(!commit || verbose){
						if(patch.added.length || patch.updated.length){
							console.log('The following files will be UPLOADED:');
							patch.added.forEach(file => {
								console.log('+ ' + fileSet.remote + '/' + file.path);
							});
							patch.updated.forEach(file => {
								console.log('* ' + fileSet.remote + '/' + file.path);
							});
						}else{
							console.log('No files will be uploaded to ' + fileSet.remote + ' (no changes detected).');
						}
						
						if(patch.removed.length){
							console.log('The following files will be DELETED:');
							
							patch.removed.forEach(file => {
								console.log('- ' + fileSet.remote + '/' + file.path);
							});
						}else{
							console.log('No files will be deleted in ' + fileSet.remote);
						}
					}
					
					// If any files are being added or updated, start gzipping them.
					var fileSetPatch = {
						fileSet,
						remoteFiles,
						localFiles,
						patch
					};
					
					if(patch.added.length || patch.updated.length){
						// Temp path first:
						var tmpFile = tmp.tmpNameSync();
						
						var filesToUpload = patch.added.concat(patch.updated).filter(entry => !entry.dir).map(entry => entry.path);
						
						fileSetPatch.compressedPatchPath = tmpFile;
						fileSetPatch.compressedPatch = tar.create(
							{
								gzip: true,
								file: tmpFile,
								cwd: path.resolve(config.projectRoot, fileSet.local)
							},
							filesToUpload
						).then(() => fileSetPatch);
					}else{
						fileSetPatch.compressedPatch = Promise.resolve(fileSetPatch);
					}
					
					return fileSetPatch;
				});
				
			});
			
			// STAGE 2 - Backup
			Promise.all(setPromises)
				.then(fileSetPatches => {
					// Remove any nulls:
					return fileSetPatches.filter(p => p != null)
				})
				.then(fileSetPatches => {
				
					// Create a backup of this remote dir.
					// It ends up in, for example, /var/www/site.com/deploy/backup/TIMESTAMP/
					var backupPromises = fileSetPatches.map(fileSetPatch => {
						var fileSet = fileSetPatch.fileSet;
						
						var srcDir = hostInfo.remoteDir + '/' + fileSet.remote;
						var targetDir = backupDir + fileSet.remote;
						
						console.log('Backing up "' + srcDir + '" to "' + targetDir + '"');
						
						return copyDirectory(srcDir, targetDir, user, connection).then(() => fileSetPatch);
					});
					
					return Promise.all(backupPromises);
				})
			
			// STAGE 3 - Compress patches (or more specifically, wait for them to complete if they haven't already)
			.then(fileSetPatches => {
				// Next we wait for the compressed patches to complete:
				return Promise.all(fileSetPatches.map(fileSetPatch => fileSetPatch.compressedPatch));
			})
			
			// STAGE 4 - Upload them (also happens in the dry run):
			.then(fileSetPatches => {
				var patchesPendingUpload = fileSetPatches.filter(fileSetPatch => !!fileSetPatch.compressedPatchPath);
				
				if(!patchesPendingUpload.length){
					return fileSetPatches;
				}
				
				console.log('Uploading ' + patchesPendingUpload.length + ' patches');
				
				if(!commit){
					console.log('(Will not be applied, only uploaded)');
				}
				
				return new Promise((success, reject) => {
					
					connection.sftp(function(err, sftp) {
						if (err) throw err;
						
						createRemoteDirectory(patchDir, user, connection).then(() => {
							
							console.log('1/' + patchesPendingUpload.length + '..');
							
							var patch = patchesPendingUpload[0];
							patch.remotePatchPath = patchDir + patch.fileSet.name + '.tar.gz';
							var current = uploadFile(patch.compressedPatchPath, patch.remotePatchPath, sftp);
							
							for(var i=1;i<patchesPendingUpload.length; i++){
								(index => {
									current = current.then(() => {
										patch = patchesPendingUpload[index];
										console.log((index + 1) + '/' + patchesPendingUpload.length + '..');
										patch.remotePatchPath = patchDir + patch.fileSet.name + '.tar.gz';
										return uploadFile(patch.compressedPatchPath, patch.remotePatchPath, sftp);
									});
								})(i);
							}
							
							current.then(() => success(fileSetPatches));
						});
					});
					
				})
				
			})
			
			// STAGE 5 - Apply patches:
			.then(fileSetPatches => {				
				
				if(!commit){
					console.log('DRY RUN - Skipping applying patches.');
					return fileSetPatches;
				}
				
				// Extract the patches now
				return Promise.all(fileSetPatches.map(fileSetPatch => {
					
					var fileSet = fileSetPatch.fileSet;
					
					if(!fileSetPatch.remotePatchPath){
						// Nothing to do.
						return Promise.resolve(fileSetPatch);
					}
					
					return extractPatch(fileSetPatch.remotePatchPath, hostInfo.remoteDir + '/' + fileSet.remote, user, connection)
						.then(() => setPermsAndUser(hostInfo.remoteDir + '/' + fileSet.remote, perms, user, connection))
						.then(() => fileSetPatch);
				}))
			})
			
			// STAGE 6 - Delete files to remove:
			.then(fileSetPatches => {				
				
				if(!commit){
					console.log('DRY RUN - Skipping deletion of files.');
					return fileSetPatches;
				}
				
				// todo!
				
				// Merge all files to remove.
				var toRemove = [];
				
				fileSetPatches.map(fileSetPatch => {
					toRemove = toRemove.concat(fileSetPatch.patch.removed);
				});
				
				if(toRemove.length){
					console.log('Removing old files is TODO');
				}
				
				return fileSetPatches;
			})
			
			// STAGE 7 - Restart the service, if there is one:
			.then(fileSetPatches => {				
				
				if(!commit){
					console.log('DRY RUN - Skipping service restart');
					return fileSetPatches;
				}
				
				console.log('Restarting service (if there is one)..');
				
				// Restart service (or try to):
				restartService(config, connection);
				
				return fileSetPatches;
			})
			.then(() => {
				console.log('Done');
				// Done:
				connection.end();
			});
			
			
		});
		
	}
	
};