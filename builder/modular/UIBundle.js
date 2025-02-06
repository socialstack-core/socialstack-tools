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


class UIBundle
{
	
	/// <summary>
	/// Creates a new bundle for the given filesystem path.
	/// </summary>
	constructor(rootPath, projectRoot, globalFileMap, minified, cache)
	{
		this.fileMap = {}; // fs path (relative) -> a particular SourceFile instance.
		this.staticFileMap = {}; // fs path (relative) -> a particular SourceFile instance.
		this.rootName = rootPath;
		this.rootPath = path.resolve(projectRoot, rootPath);
		this.sourcePath = path.resolve(projectRoot, rootPath, "Source");
		this.globalFileMap = globalFileMap;
		this.cache = cache; // UIBuildCache (never null)
		this.containsStarterModule = false;
		this.minified = minified;
		
		this.packDir = rootPath == 'Admin' ? path.resolve(projectRoot, rootPath, 'public', 'en-admin','pack') : path.resolve(projectRoot, rootPath, 'public', 'pack');
	}
	
	/// <summary>
	/// Adds the file at the given source-relative path to the map.
	/// </summary>
	/// <param name="filePath"></param>
	addToMap(fileAndStats)
	{
		var filePath = fileAndStats.path;
		var modifiedUnixTs = fileAndStats.stats.mtimeMs;
		var fileSize = fileAndStats.stats.size;
		
		var lastSlash = filePath.lastIndexOf(path.sep);
		var fileName = filePath.substring(lastSlash + 1);
		var relLength = lastSlash - this.sourcePath.length - 1;
		
		if (!fileName)
		{
			// Directory
			return null;
		}

		var relativePath = filePath.substring(this.sourcePath.length + 1, lastSlash);
		var typeDot = fileName.lastIndexOf('.');
		
		if(typeDot == -1)
		{
			// Directory
			return null;
		}
		
		var fileType = fileName.substring(typeDot + 1).toLowerCase();
		var fileNameNoType = fileName.substring(0, typeDot);
		
		if(fileType == 'git'){
			// Git directory
			return null;
		}
		
		// Check if the file name matters to us:
		var tidyFileType = filePath.indexOf(path.sep + "static" + path.sep) == -1 ? 
			this.determineFileType(fileType, fileName) :
			SourceFileType.None;

		if (tidyFileType == SourceFileType.None)
		{
			// Static content:
			var staticFile = new SourceFile();
			staticFile.isStaticFile = true;
			staticFile.path = filePath;
			staticFile.targetPath = this.packDir + '/static/' + relativePath.toLowerCase() + '/' + fileName.toLowerCase();
			this.staticFileMap[filePath] = staticFile;
			
			return null;
		}
		
		// Yes - load it.
		
		var isGlobal = false;
		var priority = 100;

		if (tidyFileType == SourceFileType.Scss)
		{
			// Is it a global SCSS file?
			isGlobal = fileName.indexOf(".global.")!=-1 || fileName.startsWith("global.");

			// 2nd last part of the file can be a number - the priority order of the scss.
			var parts = fileName.split('.');

			if (parts.length > 2)
			{
				var prio2 = parseInt(parts[parts.length - 2]);
				
				if(!isNaN(prio2))
				{
					priority = prio2;
				}
			}
		}
		
		// Is it a thirdparty module?
		var thirdParty = false;
		var modulePath = this.rootName + '/' + relativePath.replace(/\\/gi, '/');
		
		if (modulePath.indexOf("/ThirdParty/") != -1)
		{
			thirdParty = true;
			// Remove /ThirdParty/ and build module path that it represents:
			modulePath = modulePath.replace("/ThirdParty/", "/");
		}
		
		if (modulePath.indexOf(".Bundle/") != -1)
		{
			// Remove *.Bundle/ and build module path that it represents:
			var pieces = modulePath.split('/');
			var newPath = "";
			for (var i = 0; i < pieces.length; i++)
			{
				if (pieces[i].endsWith(".Bundle"))
				{
					continue;
				}

				if (newPath != "")
				{
					newPath += "/";
				}

				newPath += pieces[i];
			}

			modulePath = newPath;
		}

		// Use shortform module name if the last directory of the modulePath matches the filename.
		if (!modulePath.endsWith("/" + fileNameNoType))
		{
			modulePath += "/" + fileName;
		}
		
		if (modulePath == "UI/Start")
		{
			this.containsStarterModule = true;
		}
		
		var file = new SourceFile();
		file.isStaticFile = false;
		file.path = filePath;
		file.fileName = fileName;
		file.isGlobal = isGlobal;
		file.priority = priority;
		file.fileType = tidyFileType;
		file.rawFileType = fileType;
		file.thirdParty = thirdParty;
		file.modulePath = modulePath;
		file.fileSize = fileSize;
		file.modifiedUnixTs = modifiedUnixTs;
		file.fullModulePath = this.rootName + '/' + relativePath.replace(/\\/gi, '/');
		file.relativePath = relativePath;
		
		if (isGlobal)
		{
			this.globalFileMap.fileMap[filePath] = file;
		}
		
		this.fileMap[filePath] = file;
		
		return file;
	}
	
	copyStaticFiles()
	{
		var proms = [];
		
		for(var k in this.staticFileMap){
			var staticFile = this.staticFileMap[k];
			
			proms.push(
				copyStaticFile(staticFile.path, staticFile.targetPath, true)
			);
		}
		
		console.log('Copying ' + proms.length + ' static files (if newer)');
		return Promise.all(proms);
	}
	
	/// Makes the target pack directory if it doesn't already exist.
	ensureTarget(){
		return new Promise((s, r) => {
			console.log("Making", this.packDir);
			mkdir(this.packDir, err => {
				err ? r() : s();
			});
		});
	}
	
	/// <summary>
	/// Loads files ready for build.
	/// </summary>
	start()
	{
		return this.ensureTarget().then(() => {
			if (!fs.existsSync(this.sourcePath))
			{
				return Promise.resolve(true);
			}
			
			// Iterate through the directory tree of SourcePath and populate the initial map now.
			return allFilesInDirectory(this.sourcePath, true).then(fileStatList => {
				
				// Build the map of all src files now.
				for(var i=0;i<fileStatList.length;i++){
					var fileAndStats = fileStatList[i];
					this.addToMap(fileAndStats);	
				}
				
			});
		});
	}
	
	/// <summary>
	/// Determines the given file name + type as a particular useful source file type. "None" if it didn't.
	/// </summary>
	/// <param name="fileType"></param>
	/// <param name="fileName"></param>
	/// <returns></returns>
	determineFileType(fileType, fileName)
	{
		if (fileType == "js" || fileType == "jsx" || ((fileType == "ts" || fileType == "tsx") && !fileName.endsWith(".d.ts") && !fileName.endsWith(".d.tsx")))
		{
			return SourceFileType.Javascript;
		}
		else if (fileType == "css" || fileType == "scss")
		{
			return SourceFileType.Scss;
		}
		else if (fileName == "module.json")
		{
			return SourceFileType.ModuleMeta;
		}

		return SourceFileType.None;
	}
	
	/// <summary>
	/// Builds the main.js, main.css and the meta.json file, as well as the static content pack directory.
	/// </summary>
	buildEverything()
	{
		// Handle the initial compile of each file.
		var buildProms = [];
		
		for(var key in this.fileMap){
			var file = this.fileMap[key];
			
			var cachedFile = this.cache.getFile(this, key); // null if not present in the bundle set
			
			if(cachedFile){
				// Is it invalid?
				if(this.cache.fileChanged(file, cachedFile)){
					cachedFile = null;
				}
			}
			
			if (file.fileType == SourceFileType.Javascript)
			{
				buildProms.push(
					this.buildJsFile(file, cachedFile)
				);
			}
			else if (file.fileType == SourceFileType.Scss && !file.isGlobal)
			{
				if(this.globalFileMap.hasChanges){
					cachedFile = null;
				}
				
				buildProms.push(
					this.buildScssFile(file, cachedFile)
				);
			}
			
		}
		
		return Promise.all(buildProms).then(() => {
			
			// Construct the js/ css files:
			this.constructJs();
			this.constructCss();
			
		}).then(() => {
			
			// Copy static files to target:
			return this.copyStaticFiles();
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
				
				if (file.templates != null && file.templates.length > 0)
				{
					// This file has templates in it. Note that this array is _always_ sorted first to last (in source order), so substrings can be nice and fast.
					for(var i=0;i<file.templates.length;i++)
					{
						var template = file.templates[i];
						
						jsMeta.templates.push({
							module: template.module,
							original: template.original,
							target: template.target,
							variableMap: template.variableMap,
							start: template.start + startOffset,
							end: template.end + startOffset
						});
						
					}
				}
			}
		}

		if (this.containsStarterModule)
		{
			// Invoke start:
			jsMeta.starter = true;
		}
		
		// Write the files out now:
		this.outputFile('main.prebuilt.js', builtJs);
		this.outputFile('meta.json', JSON.stringify(jsMeta));
	}

	outputFile(fileName, content){
		var outputPath = path.resolve(this.packDir + '/' + fileName);
		console.log("Outputting '" + fileName + "' to: ", outputPath);
		fs.writeFileSync(outputPath, content, {encoding: 'utf8'});
	}

	/// <summary>
	/// Updates the main css.
	/// </summary>
	constructCss()
	{
		var css = '';
		var files = [];
		
		for(var key in this.fileMap)
		{
			var file = this.fileMap[key];
			
			if (file.fileType == SourceFileType.Scss && !file.isGlobal && file.transpiledContent)
			{
				files.push(file);
			}
		}
		
		files = files.sort((a,b) => (a.priority > b.priority) ? 1 : ((b.priority > a.priority) ? -1 : 0));
		
		files.forEach(file => {
			css += file.transpiledContent;
		});
		
		this.outputFile('main.prebuilt.css', css);
	}

	
	/// <summary>
	/// Peek char at index. If it is out of range, a nul byte is returned.
	/// </summary>
	/// <param name="str"></param>
	/// <param name="index"></param>
	/// <returns></returns>
	peekString(str, index)
	{
		return index >= str.length ? '\0' : str[index];
	}
	
	/// <summary>
	/// Remap the url() calls in the given css string.
	/// </summary>
	/// <returns></returns>
	remapUrlsInCssAndRemoveComments(css, moduleFileSystemPath)
	{
		// moduleFileSystemPath Always starts with the bundle name, so pop that off:
		var fs = moduleFileSystemPath.indexOf('/');

		if (fs != -1)
		{
			moduleFileSystemPath = moduleFileSystemPath.substring(fs + 1);
		}
		
		var moduleFSPath = moduleFileSystemPath.split('/');
		// node-sass can't do this bit for us unfortunately, so we'll have to do a simple state machine instead.
		var sb = '';
		var mode = 0;
		var urlStart = 0;
		
		for (var i = 0; i < css.length; i++)
		{
			var ch = css[i];
			if (mode == 1)
			{
				// Note that this strips comments as well (we could retain them though).

				if (ch == '*' && this.peekString(css, i + 1) == '/')
				{
					mode = 0;
					i++;
				}
			}
			else if (mode == 2)
			{
				if (ch == ')')
				{
					// Terminated at i-1.
					var completeUrlText = css.substring(urlStart, i).trim();

					if (completeUrlText.length > 1 && completeUrlText[0] == '"')
					{
						completeUrlText = completeUrlText.substring(1, completeUrlText.length - 1);
					}
					
					// Remap it:
					sb += "url(\"";
					sb += this.mapUrl(completeUrlText.trim(), moduleFSPath);
					sb += "\")";
					mode = 0;
				}
			}
			else if (ch == '/' && this.peekString(css, i + 1) == '*')
			{
				mode = 1;
			}
			else if (ch == 'u' && this.peekString(css, i + 1) == 'r' && this.peekString(css, i + 2) == 'l' && this.peekString(css, i + 3) == '(') // Spaces are not permitted in the CSS spec before (
			{
				// We're in a url(.. - mark the starting index:
				urlStart = i + 4;
				mode = 2;
			}
			else
			{
				sb += ch;
			}
		}


		return sb;
	}
	
	/// <summary>
	/// Maps a source URL for CSS files. Don't use this for outputting JS because urls there are not relative to the JS file location (whereas CSS is).
	/// </summary>
	/// <param name="sourcePath">E.g. "./images/test.jpg"</param>
	/// <param name="filePathParts">The filesystem path of the module the source file is in relative to the bundle Source folder.</param>
	/// <returns></returns>
	mapUrl(sourcePath, filePathParts)
	{
		if (sourcePath.startsWith('.'))
		{
			// Relative filesystem path.
			var pathParts = sourcePath.split('/');
			var builtPath = [];

			for (var i = 0; i < filePathParts.length; i++)
			{
				builtPath.push(filePathParts[i]);
			}

			for (var i = 0; i < pathParts.length; i++)
			{
				var pathPart = pathParts[i];
				if (pathPart == ".")
				{
					// Just ignore this
				}
				else if (pathPart == "..")
				{
					// Pop:
					if (builtPath.length < 1)
					{
						throw new Error(
							"The source path '" + sourcePath + "' in a css file is referring to a file outside the scope of the source directory. It was in " + filePathParts.join('/')
						);
					}
					builtPath.pop();
				}
				else
				{
					builtPath.push(pathPart);
				}
			}
			
			return "./static/" + builtPath.join('/').toLowerCase();
		}

		// Unchanged otherwise as it's absolute.
		return sourcePath;
	}

	
	/// <summary>
	/// Builds the given SCSS file, optionally using cached data if present.
	/// </summary>
	/// <param name="file"></param>
	buildScssFile(file, cachedFile)
	{
		if(cachedFile && cachedFile.content){
			file.transpiledContent = cachedFile.content;
			return Promise.resolve(true);
		}
		
		// Load the file contents now:
		return file.loadTextContent().then(() => {
			this.transformScssFile(file);
		});
	}
	
	/// <summary>
	/// Transforms the given SCSS file.
	/// </summary>
	/// <param name="file"></param>
	transformScssFile(file)
	{
		var rawContent = file.content;
		
		// Transform the SCSS now:
		var header = this.globalFileMap.getScssHeader();
		var transpiledCss = transformScss(rawContent, header, file.path, this.minified);
		
		// Convert URLs:
		transpiledCss = this.remapUrlsInCssAndRemoveComments(transpiledCss, file.fullModulePath);
		
		// Apply transpiled content:
		file.transpiledContent = transpiledCss;
		file.failure = null;
	}
	
	/// <summary>
	/// Builds the given JS file, optionally using cached data if present.
	/// </summary>
	/// <param name="file"></param>
	buildJsFile(file, cachedFile)
	{
		if(cachedFile && cachedFile.content){
			file.transpiledContent = cachedFile.content;
			file.templates = cachedFile.templates;
			return Promise.resolve(true);
		}
		
		// Load the file contents now:
		return file.loadTextContent().then(() => {
			this.transformJsFile(file);
		});
	}
	
	/// <summary>
	/// Transforms the given JS file.
	/// </summary>
	/// <param name="file"></param>
	transformJsFile(file){
		// Transform it now (developers only here - we only care about ES8, i.e. minimal changes to source/ react only):
		var es8JavascriptResult = transformES8(
			file.content,
			file.modulePath, // Module path
			file.fullModulePath,
			{minified:this.minified}
		);
		
		// Get the src:
		var es8Javascript = es8JavascriptResult.src;
		var literals = es8JavascriptResult.templateLiterals;
		
		/*
		// Add any NPM packages to the global bundle:
		for(var k in es8JavascriptResult.npmPackages){
			this.globalFileMap.npmPackages[k] = 1;
		}
		*/
		
		if (literals != null)
		{
			var templates = null;

			literals.forEach(literal => 
				{
					var original = literal.original;
					var target = literal.target;
					var start = literal.start;
					var end = literal.end;
					var expressions = literal.expressions;

					if (templates == null)
					{
						templates = [];
					}
					
					// variable map:
					var varMap = null;

					if (expressions != null && expressions.length > 0)
					{
						// has at least 1 expression in it. Create var map:
						varMap = {};
						expressions.forEach(expr => {
							if (expr.from != null && expr.to != null){
								varMap[expr.from] = expr.to;
							}
						});
					}
					
					var template = new TemplateLiteral();
					template.module = file.modulePath;
					template.target = target;
					template.original = original;
					template.start = start;
					template.end = end;
					template.variableMap = varMap;
					
					templates.push(template);
				}
			);
			
			file.templates = templates;
		}
		
		// Apply transpiled content:
		file.transpiledContent = es8Javascript;
		file.failure = null;
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

module.exports = UIBundle;