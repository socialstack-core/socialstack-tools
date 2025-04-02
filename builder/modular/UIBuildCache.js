var fs = require('fs');


class UIBuildCache {
	
	constructor(cacheDir) {
		this.cacheDir = cacheDir;
		this.fileName = 'ui-cache.bin';
		this.path = cacheDir ? (cacheDir + '/' + this.fileName) : null; // path to a .bin file.
		this.reset();
	}
	
	reset(){
		this.data = {
			globalFileMap: [], // Sorted array of CachedFileMeta. Each has {modifiedUnixTs, path, fileSize}.
			globalScssHeader: '', // The global SCSS header.
			bundles: {}, // e.g. this.data.bundles['UI'] exists and is a fileMap. Each entry has {modifiedUnixTs, path, fileSize, content}
		};
	}
	
	start(){
		if(!this.path){
			return Promise.resolve(true);
		}
		
		return new Promise((s, r) => {
			this.loadTextFile(this.path).then(text => {
			
				// It's actually just a large JSON file at the moment:
				this.data = JSON.parse(text);
				
				s();
				
			}).catch(e => {
				// Do nothing if the error is simply that the file or directory does not exist.
				if(e && e.code == 'ENOENT'){
					s();
					return;
				}
				
				console.warn("Cache load failure, ignoring it.", e);
				s();
			});
			
		});
	}
	
	save(globalMap, bundles){
		if(!this.path){
			return Promise.resolve(true);
		}
		
		this.data = {bundles: {}};
		this.data.globalFileMap = globalMap.sortedGlobalFiles.map(entry => {
			return {
				modifiedUnixTs: entry.modifiedUnixTs,
				fileSize: entry.fileSize,
				path: entry.path
			};
		});
		this.data.globalScssHeader = globalMap.scssHeader;
		
		bundles.forEach(bundle => {
			var bundleCacheData = {
				fileMap: {}
			};
			
			for(var k in bundle.fileMap){
				var entry = bundle.fileMap[k];
				
				if(!entry.transpiledContent){
					continue;
				}
				
				bundleCacheData.fileMap[k] = {
					modifiedUnixTs: entry.modifiedUnixTs,
					fileSize: entry.fileSize,
					path: entry.path,
					content: entry.transpiledContent,
					templates: entry.templates
				};
			}
			
			this.data.bundles[bundle.rootName] = bundleCacheData;
			
		});
		
		return this.writeToFile();
	}
	
	writeToFile(){
	
		return new Promise((s, r) => {
			
			// Ensure dir exists:
			fs.mkdir(this.cacheDir, { recursive: true }, (err) => {
				if (err && err.code != 'EEXIST') throw err;
				
				// Write to it:
				fs.writeFile(this.path, JSON.stringify(
					this.data,
					null,
					'\t'
				), err => err ? r(err) : s());
			});
		});
	}
	
	/// <summary>
	/// Checks if the date modified, path or size have changed.
	/// </summary>
	getFile(bundle, key){
		if(!this.data || !this.data.bundles){
			return null;
		}
		
		var bundleSet = this.data.bundles[bundle.rootName];
		
		if(!bundleSet || !bundleSet.fileMap){
			return null;
		}
		
		return bundleSet.fileMap[key];
	}
	
	/// <summary>
	/// Checks if the date modified, path or size have changed.
	/// </summary>
	fileChanged(metaA, metaB){
		if(!metaA || !metaB){
			return true;
		}
		
		return (metaA.modifiedUnixTs != metaB.modifiedUnixTs || metaA.fileSize != metaB.fileSize || metaA.path != metaB.path);
	}
	
	/// <summary>
	/// Loads a text file at the given path, in utf8. It can also have a BOM.
	/// </summary>
	loadTextFile(path) {
		return new Promise((s, r) => {
			
			fs.readFile(path, {encoding: 'utf8'}, function(err, fileContent){
				if(err){
					return r(err);
				}
				
				// drop the BOM if there is one
				if (fileContent.length && fileContent.charCodeAt(0) === 0xFEFF) {
					fileContent=fileContent.slice(1);
				}
				
				s(fileContent);
			});
			
		});
	}
	
}

module.exports = UIBuildCache;