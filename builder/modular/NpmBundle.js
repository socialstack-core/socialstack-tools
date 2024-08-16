var path = require('path');
var fs = require('fs');
var SourceFileType = require('./SourceFileType.js' );
var SourceFile  = require( './SourceFile.js' );
var TemplateLiteral  = require( './TemplateLiteral.js' );
var allFilesInDirectory  = require( './allFilesInDirectory.js' );
var { transformES8 } = require('./js-transforms.js');
var { transform : transformScss } = require('./css-transforms.js');
var mkdir = require('../buildwatch/mkdir-recursive.js');
var copyStaticFile = require('./copyStaticFiles.js');
var path = require('path');

class NpmBundle
{
	
	/// <summary>
	/// Creates a new bundle for the given filesystem path.
	/// </summary>
	constructor(projectRoot, minified, globalMap)
	{
		this.fileMap = {}; // fs path (relative) -> a particular SourceFile instance.
		this.projectRoot = projectRoot;
		this.minified = minified;
		this.globalFileMap = globalMap;
		this.packDir = path.resolve(projectRoot, 'UI', 'public', 'pack');
	}
	
	/// <summary>
	/// Adds the file at the given source-relative path to the map.
	/// </summary>
	/// <param name="filePath"></param>
	addRequire(filePath, relativeTo)
	{
		relativeTo = relativeTo || (this.projectRoot + '/node_modules/');
		
		return new Promise((success, reject) => {
				
			if(filePath.startsWith('.') || filePath.startsWith('..')){
				path.resolve(relativeTo, filePath);
			}else{
				// Figure out which file is the root of this module.
				// Read its package.json first:
			
				var fullModulePath = relativeTo + filePath;
				
				this.loadTextFile(path.resolve(fullModulePath, 'package.json')).then(packageJson => {
					
					var loadedPkg = JSON.parse(packageJson);
					
					var moduleRoot = loadedPkg.module || "esm";
					var fStat;
					var filePath;
					
					try{
						filePath = path.resolve(fullModulePath, moduleRoot);
						fStat = fs.statSync(filePath);
						
						if(fStat.isDirectory()){
							filePath = path.resolve(modRoot, 'index.js');
							fStat = fs.statSync(filePath);
						}
						
					}catch{
						// Not an ESM module. Can still attempt to include it, 
						// but tree-shaking optimisation will be disabled.
						filePath = path.resolve(fullModulePath, loadedPkg.main || 'index.js');
						try{
							fStat = fs.statSync(filePath);
						}catch{
							throw new Error(
								"Unable to require '" + filePath + "' as it doesn't appear to exist. " + 
								"You may need to run 'npm init' if e.g. somebody else installed an npm package on this project."
							);
						}
					}
					
					console.log(filePath);
					
					// Load the file:
					this.loadTextFile(filePath).then(content => {
						
						var file = {
							fileType: SourceFileType.Javascript,
							content,
							modulePath: 'Npm/' + filePath,
							fullModulePath 
						};
						
						this.fileMap['Npm/' + filePath] = file;
						
						this.buildJsFile(file).then(success);
					});
					
				})
				
			}
			
		});
	}
	
	/// <summary>
	/// Builds the main.js, main.css and the meta.json file, as well as the static content pack directory.
	/// </summary>
	buildEverything()
	{
		return new Promise((s,r) => {
			
			// Construct the js file:
			this.constructJs();
			
			s();
		});
		
	}
	
	/// <summary>
	/// Updates the main js.
	/// </summary>
	constructJs()
	{
		// Result segments:
		var segments = [];
		var jsMeta = {
			buildTime: Date.now(),
			templates: []
		};
		
		var builtJs = '';
		
		for(var key in this.fileMap)
		{
			var file = this.fileMap[key];
			
			if (file.fileType == SourceFileType.Javascript)
			{
				var startOffset = builtJs.length;
				builtJs += file.transpiledContent;
			}
		}
		
		// Write the files out now:
		this.outputFile('npm.prebuilt.js', builtJs);
	}
	
	outputFile(fileName, content){
		console.log(fileName, content);
		fs.writeFileSync(this.packDir + '/' + fileName, content, {encoding: 'utf8'});
	}

	/// <summary>
	/// Builds the given JS file.
	/// </summary>
	/// <param name="file"></param>
	buildJsFile(file)
	{	
		var proms = [];
	
		// Transform it now (developers only here - we only care about ES8, i.e. minimal changes to source/ react only):
		var es8JavascriptResult = transformES8(
			file.content,
			file.modulePath, // Module path
			file.fullModulePath,
			{
				commonJs: true,
				minified: this.minified,
				outputRelativeRequires: true
			}
		);
		
		// Get the src:
		var es8Javascript = es8JavascriptResult.src;
		
		// Add any NPM packages to the global bundle:
		for(var k in es8JavascriptResult.npmPackages){
			if(!this.globalFileMap.npmPackages[k]){
				this.globalFileMap.npmPackages[k] = 1;
				proms.push(this.addRequire(k));
			}
		}
		
		// Add any relative paths as well:
		for(var k in es8JavascriptResult.relativeRequires){
			var absFilePath = es8JavascriptResult.relativeRequires[k];
			console.log(absFilePath);
		}
		
		// Apply transpiled content:
		file.transpiledContent = es8Javascript;
		file.failure = null;
		
		return Promise.all(proms);
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
				
				// drop the BOM
				if (fileContent.length && fileContent.charCodeAt(0) === 0xFEFF) {
					fileContent=fileContent.slice(1);
				}
				
				s(fileContent);
			});
			
		});
	}
}

module.exports = NpmBundle;