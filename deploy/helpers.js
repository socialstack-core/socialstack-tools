var path = require('path');
var fs = require('fs');
var { jsConfigManager } = require('../configManager');

function uploadFile(src, dst, sftp){
	
	return new Promise((success, fail) => {
		sftp.fastPut(src, dst, err => {
			if(err){
				return fail(err);
			}
			success();
		});
	});
	
}

/*
* Makes a remote dir
*/
function createRemoteDirectory(dir, ownerUser, connection){
	
	var perms = 777;
	
	return new Promise((success, fail) => {
		connection.exec('sudo mkdir -p "' + dir + '"', function(err, stream) {
			if(err){
				return fail(err);
			}
			
			var error;
			
			stream.on('close', function(code, signal) {
				if(error){
					fail(error);
				}else{
					setPermsAndUser(dir, perms, ownerUser || 'www-data', connection).then(success).catch(fail);
				}
			})
			.on('data', function(data){
				// Required for close to fire
			})
			.stderr.on('data', function(data) {
				// The directory doesn't exist.
				error = String.fromCharCode.apply(null, data);
				console.log(error);
			});
			
		});
	});
	
}

function extractPatch(src, dst, ownerUser, connection){
	
	// First, make sure target directory exists:
	return createRemoteDirectory(dst, ownerUser, connection).then(
		() => new Promise((success, fail) => {
			connection.exec('sudo tar -xf "' + src + '" -C "' + dst +'"', function(err, stream) {
				if(err){
					return fail(err);
				}
				
				success();
			});
		})
	);
	
}

/*
* Sets file owner + mode
*/
function setPermsAndUser(target, mode, user, connection){
	return new Promise((success, fail) => {
		connection.exec('sudo chmod -R ' + mode + ' "' + target + '" && sudo chown -R ' +user + ':'+user + ' "' + target + '"', function(err, stream) {
			if(err){
				return fail(err);
			}
			
			stream.on('close', function(code, signal) {
				success();
			})
			.on('data', function(data){
				// Required for close to fire
			})
		});
	});
}

/*
* Sets file owner + mode
*/
function handleRenames(remoteDir, renames, connection){
	return new Promise((success, fail) => {
		if(!renames || !renames.length){
			return success();
		}
		
		var bash = '';
		
		for(var i=0;i<renames.length;i++){
			if(bash){
				bash += ' && ';
			}
			var rename = renames[i];
			bash += 'sudo mv "' + remoteDir + '/' + rename.src + '" "' + remoteDir + '/' + rename.target + '"';
		}
		
		console.log('Renaming ' + renames.length + ' file(s) remotely');
		
		connection.exec(bash, function(err, stream) {
			if(err){
				return fail(err);
			}
			
			stream.on('close', function(code, signal) {
				success();
			})
			.on('data', function(data){
				// Required for close to fire
			})
		});
	});
}

/*
* Copies a directory (to back it up). Note that this will also create directories if they're needed.
*/

function copyDirectory(src, dst, ownerUser, connection){
	
	return createRemoteDirectory(dst, ownerUser, connection).then(() => new Promise((success, fail) => {
		connection.exec('sudo cp -r "' + src + '" "' + dst + '"', function(err, stream) {
			if(err){
				return fail(err);
			}
			
			stream.on('close', function(code, signal) {
				success();
			})
			.on('data', function(data){
				// Required for close to fire
			})
			
		});
	}));
}

/*
* Gets a list of files in the given directory on the remote system.
*/
function remoteFileList(dir, connection){
	
	return new Promise((success, fail) => {
		connection.exec('sudo find "' + dir + '" -printf "%d %s %T@ %f\n"', function(err, stream) {
			if (err){
				return fail(err);
			}
			
			// Buffer up the results:
			var blocks = [];
			
			stream.on('close', function(code, signal) {
				var response = blocks.join();
				var lines = response.split('\n');
				
				var dirBuffer = [''];
				
				var files = [];
				
				for(var i=1;i<lines.length;i++){
					var line = lines[i];
					var linePieces = line.split(' ');
					if(linePieces.length < 4){
						continue;
					}
					
					var depth = parseInt(linePieces[0]);
					var sizeInBytes = parseInt(linePieces[1]);
					var writeTimestampUnixUtc = parseFloat(linePieces[2]);
					var fileName = linePieces.slice(3).join(' ');
					
					var remoteFile = {
						sizeInBytes,
						fileName,
						writeTimestampUnixUtc
					};
					
					var activeDepth = dirBuffer.length;
						
					if(depth == activeDepth){
						// Update latest entry:
						dirBuffer[depth - 1] = fileName;
					}else if(depth > activeDepth){
						// This entry is a child of the previous one.
						dirBuffer.push(fileName);
					}else{
						// Dropping down (potentially multiple layers).
						dirBuffer = dirBuffer.slice(0, depth);
						dirBuffer[depth - 1] = fileName;
					}
					
					remoteFile.path = dirBuffer.join('/');
					files.push(remoteFile);
				}
				
				// Done: 
				success(files);
				
			}).on('data', function(data) {
				blocks.push(data);
			}).stderr.on('data', function(data) {
				// The directory doesn't exist.
				success([]);
				// fail(String.fromCharCode.apply(null, data));
			});
		});
	});
}

function walkLocalDir(dir, done, root) {
	if(!root){
		root = path.resolve(dir);
	}
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err, []);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
      var fullPath = path.resolve(dir, file);
      fs.stat(fullPath, function(err, stat) {
        if (stat && stat.isDirectory()) {
			results.push({
			  fileName: file,
			  writeTimestampUnixUtc: Math.floor(stat.mtimeMs / 1000),
			  sizeInBytes: stat.size,
			  dir: true,
			  path: fullPath.substring(root.length + 1).replace(/\\/gi, '/')
		  });
          walkLocalDir(fullPath, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          }, root);
        } else {
          results.push({
			  fileName: file,
			  writeTimestampUnixUtc: Math.floor(stat.mtimeMs / 1000),
			  sizeInBytes: stat.size,
			  path: fullPath.substring(root.length + 1).replace(/\\/gi, '/')
		  });
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

/*
* Gets a list of files in the given directory on the local system.
* Importantly the objects follow the same format as the remote system ones.
*/
function localFileList(dir){
	
	return new Promise((success, reject) => {
		
		// Call recursive func:
		walkLocalDir(dir, (err, files) => {
			if(err){
				return reject(err);
			}
			success(files);
		});
		
	});
	
}

function createFileLookup(files){
	var lookup = {};
	for(var i=0;i<files.length;i++){
		var file = files[i];
		lookup[file.path] = file;
	}
	return lookup;
}

/*
* Finds entries in the "new list" which aren't in the previous lookup.
*/
function findNewEntries(prevLookup, newList){
	
	var results = [];
	
	for(var i=0;i<newList.length;i++){
		var entry = newList[i];
		
		if(!prevLookup[entry.path] && !entry.dir){
			// It's new:
			results.push(entry);
		}
	}
	
	return results;
}

/*
* restarts the API service (if there is one).
*/
function restartService(config, connection) {
	
	var appsettings = getAppSettings(config);
	
	if(appsettings.serviceName){
		return Promise.resolve(true);
	}
	
	return new Promise((success, fail) => {
		connection.exec('sudo service "' + appsettings.serviceName + '" restart', function(err, stream) {
			if(err){
				return fail(err);
			}
			success();
		});
	});
}

function getAppSettings(config){
	
	if(config.loadedAppSettings){
		return config.loadedAppSettings;
	}
	
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
	var appsettings = appsettingsManager.get();
	config.loadedAppSettings = appsettings;
	
	var baseUrl = appsettings.BaseUrl;
	
	var protoParts = baseUrl.split('://');
	
	if(protoParts.length > 1){
		baseUrl = protoParts[1];
	}
	
	baseUrl = baseUrl.replace(/\//gi, '');
	
	appsettings.siteBasename = baseUrl;
	
	if(appsettings.serviceName === undefined){
		appsettings.serviceName = baseUrl;
	}
	
	return appsettings;
}

/*
* Creates a diff set between file systems.
*/
function diff(remoteList, localList){
	
	var remoteLookup = createFileLookup(remoteList);
	var localLookup = createFileLookup(localList);
	
	// Added files are ones which are in the local lookup but not in the remote lookup:
	var added = findNewEntries(remoteLookup, localList);
	
	// Updated files are ones which are in both, but the local list is newer or bigger.
	var updated = [];
	
	for(var i=0;i<localList.length;i++){
		var entry = localList[i];
		var remoteEntry = remoteLookup[entry.path];
		if(entry.dir || !remoteEntry){
			continue;
		}
		
		// Compare date + size:
		if(remoteEntry.writeTimestampUnixUtc < entry.writeTimestampUnixUtc || remoteEntry.sizeInBytes != entry.sizeInBytes){
			// It's changed:
			updated.push(entry);
		}
	}
	
	// Removed files are ones which are in the remote lookup but not in the local lookup:
	var removed = findNewEntries(localLookup, remoteList);
	
	return {
		added,
		updated,
		removed
	};
}

module.exports = {
	remoteFileList,
	localFileList,
	diff,
	uploadFile,
	copyDirectory,
	createRemoteDirectory,
	extractPatch,
	setPermsAndUser,
	restartService,
	handleRenames
};