var Babel = require("@babel/standalone");
var fs = require('fs');
var sass = require('sass');
var path = require('path');
var nodeWatch = require('recursive-watch');
var zlib = require('zlib');
var mkdir = require('./mkdir-recursive.js');

/*
* This is used to map require('pathStrings') to a suitable value.
* For example, if you require a static content file such as a png, it'll instead be converted to a URL.
*/
function mapPathString(nodePath, state) {
	if (!state.types.isStringLiteral(nodePath)) {
		return;
	}

	const sourcePath = nodePath.node.value.replace(/\\/g, '/');
	let modulePath = null;
	
	if(sourcePath.startsWith('.')){
		
		// Relative filesystem path.
		
		const fileModulePathParts = state.fileModulePathParts;
		
		var pathParts = sourcePath.split('/');
		
		var builtPath = fileModulePathParts.slice(0);
		
		for(var i=0;i<pathParts.length;i++){
			var pathPart = pathParts[i];
			if(pathPart == '.'){
				// Just ignore this
			}else if(pathPart == '..'){
				builtPath.pop();
			}else{
				builtPath.push(pathPart);
			}
		}
		
		// If we've got a filetype, check if its a static file.
		var lastPart = builtPath[builtPath.length-1];
		var lastDot = lastPart.lastIndexOf('.');
		if(lastDot != -1){
			var fileType = lastPart.substring(lastDot + 1).toLowerCase();
			
			var json = fileType == 'json' && builtPath.length > 1 && lastPart == builtPath[builtPath.length-2];
			
			if(fileType != 'js' && !json && fileType != 'scss' && fileType != 'css' && fileType != 'git'){
				// Anything else is considered static here.
				
				builtPath.pop();
				
				var targetUrl = mapUrl(state.map, builtPath.join('/').toLowerCase() + '/' + lastPart);
				var targetLocal = nodePath.parent.specifiers[0].local;
				
				nodePath.parentPath.replaceWith(
					state.types.variableDeclaration("var", [state.types.variableDeclarator(targetLocal, state.types.stringLiteral(targetUrl))])
				);
				
				nodePath.node.pathResolved = true;
				
			}
		}
		
		modulePath = builtPath.join('/');
		
	}else{
		
		state.moduleNames.forEach(dirName => {
			if(sourcePath.startsWith(dirName + '/')){
				// It's a module path (from 'UI/Start').
				// If it contains a . - i.e. is a full path - use it as-is.
				// Otherwise, we must take the last part of the module path and repeat it.
				// UI/Start -> UI/Start/Start.js.
				
				if(sourcePath.indexOf('.') != -1){
					// Use as-is.
					modulePath = sourcePath;
				}else{
					var parts = sourcePath.split('/');
					modulePath = sourcePath + '/' + parts[parts.length-1] + '.js';
				}
			}
		});
		
	}
	
	// Unchanged otherwise. It's an npm package.
	
	if (modulePath) {
		if (nodePath.node.pathResolved) {
			return;
		}

		nodePath.replaceWith(state.types.stringLiteral(modulePath));
		nodePath.node.pathResolved = true;
	}
}

function transformImport(nodePath, state) {
	if (state.moduleResolverVisited[nodePath]) {
		return;
	}
	
	state.moduleResolverVisited[nodePath] = true;
	
	mapPathString(nodePath.get('source'), state);
}

const importVisitors = {
	'ImportDeclaration|ExportDeclaration': transformImport,
};

const visitor = {
	Program: {
		enter(programPath, state) {
			programPath.traverse(importVisitors, state);
		},
		exit(programPath, state) {
			programPath.traverse(importVisitors, state);
		},
	},
};

function mapUrl(map, srcUrl, inPackDir){
	
	var admin = (srcUrl.indexOf('admin/') === 0);
	var baseUrl = map.config.baseUrl || '';
	
	if(map.config.relativePaths){
		if(inPackDir){
			return baseUrl + 'modules/' + srcUrl;
		}else{
			return baseUrl + (admin ? 'en-admin/' : '')  + 'pack/modules/' + srcUrl;
		}
	}
	
	return baseUrl + (admin ? '/en-admin/' : '')  + '/pack/modules/' + srcUrl;
}

function transpile(map, text, modulePath, moduleNames){
	var fileModulePathParts = modulePath.split('/');
	fileModulePathParts.pop();
	
	// Transpiling multiple files in parallel. 
	// Can't share the import plug as it holds file specific state.
	var importPlug = ({ types }) => ({
		name: 'module-resolver',
		
		manipulateOptions(opts) {

		},

		pre(file) {
			this.types = types;
			this.map = map;
			this.moduleNames = moduleNames;
			this.fileModulePathParts = fileModulePathParts;
			this.moduleResolverVisited = {};
		},

		visitor,

		post() {
			this.moduleResolverVisited = {};
		},
	});
	
	try{
		return Babel.transform(
			text, {
				presets: [require('@babel/preset-env'), require('@babel/preset-react')],
				plugins: [importPlug, 'external-helpers', 'proposal-class-properties'],
				comments: false,
				minified: map.config.minified
			}
		).code;
	}catch(e){
		var errorMessage = e.toString();
		addError(map.config, "[" + modulePath + "] " + errorMessage);
		return "throw new Error(\"[" + modulePath + "] " + errorMessage.replace(/\r/g,'\\r').replace(/\n/g, '\\n') + "\");";
	}
}

function addError(config, message){
	var response = null;
	
	if(config.onError){
		response = config.onError(message);
	}
	
	if(!response || !response.silent){
		console.error(message);
	}
}

function sassTranspile(fileContent, modulePath, map){
	try{
		return sass.renderSync({
		  data: fileContent,
		  outputStyle: map.config.minified ? 'compressed' : undefined
		}).css.toString();
	}catch(e){
		var errorMessage = e.toString();
		addError(map.config, "[" + modulePath + "] " + errorMessage);
		
		// Output bad CSS so the error appears on the frontend too:
		return "\r\n[" + modulePath + "] " + errorMessage + "\r\n";
	}
}

function loadFromFile(map, filePath, modulePath, useRaw, moduleNames, onLoaded) {
	
	fs.readFile(filePath, {encoding: 'utf8'}, function(err, fileContent){
		
		if(err){
			addError(map.config, "[" + filePath + "] " + err);
			onLoaded({
				filePath,
				modulePath,
				content: ''
			});
		}else{
		
			// drop the BOM
			if (fileContent.charCodeAt(0) === 0xFEFF) {
				fileContent=fileContent.slice(1);
			}
			
			onLoaded({
				filePath,
				modulePath,
				content: useRaw ? fileContent : transpile(map, fileContent, modulePath, moduleNames)
			});
		}
		
	});
	
}

function loadFromDirectory(dirPath, modulePath, map, isThirdParty, onDone) {
	
	var config = map.config;
	var dirParts = dirPath.replace(/\\/g, '/').split('/');
	var lastDirectory = dirParts[dirParts.length-1];
	
	fs.readdir(dirPath, (err, list) => {
		
		if(!list || !list.length){
			// Doesn't exist yet.
			return onDone();
		}
		
		var promises = list.map(entry => new Promise((success, reject) => {
		
			var fullPath = dirPath + '/' + entry;
			
			fs.stat(fullPath, (err, stats) => {
				if(err){
					// Some kind of directory locking issue.
					addError(config, err);
					return success();
				}
				if(stats.isDirectory()){
					
					var newModulePath;
					var lcName = entry.toLowerCase();
					
					if(lcName == 'ignore' || lcName == 'socialstack.ignore'){
						return success();
					}
					
					// Don't set isThirdParty itself as future iterations from list.map will have it set incorrectly.
					var subDirIsAlsoThirdParty = isThirdParty;
					
					if(lcName == 'thirdparty' || lcName.endsWith('.bundle')){
						newModulePath = modulePath;
						subDirIsAlsoThirdParty = true;
					}else{
						newModulePath = modulePath + '/' + entry;
					}
					
					// Handle the directory:
					loadFromDirectory(fullPath, newModulePath, map, subDirIsAlsoThirdParty, success);
				}else{
					// Entry is a file.
					var pieces = entry.split('.');
					
					// Add it to the mapping now:
					addToMap(map, fullPath, modulePath, entry, config.moduleNames, lastDirectory, isThirdParty, success);
				}
				
			});
		}));
		
		Promise.all(promises).then(onDone);
	});
}

var hasQuote = /^\s*('|")/;
var cssUrlRegexSet = [
  /(url\s*\()(\s*')([^']+?)(')/gi,
  /(url\s*\()(\s*")([^"]+?)(")/gi,
  /(url\s*\()(\s*)([^\s'")].*?)(\s*\))/gi,
];

/* Remaps e.g. url(./hello/) in an *scss* file. */
function remapScssUrls(scss, baseLocalUrl){
	// node-sass can't do this for us, so we'll instead use a (naive) regex.
	// This will break if the user e.g. defines a mixin which happens to have e.g. -url( in its name.
	// Replace this with a complete parsing solution in the future.
    // The regexes here came from replace-css-url npm package.
  
   return cssUrlRegexSet.reduce((scss, reg, index) => {
		return scss.replace(reg, (all, lead, quote1, path, quote2) => {
			var ret = path;
			
			if(path){
				var pathTest = path.trim();
				if(pathTest.startsWith('./')){
					// Component relative path. Replace it with baseLocalUrl:
					ret = baseLocalUrl + pathTest.substring(2);
				}
			}
			
		  if(hasQuote.test(ret) && hasQuote.test(quote1)) quote1=quote2=''
		  return lead + quote1 + ret + quote2
		})
	}, scss);
	
}

/*
* Removes the given path - which may be a directory - from the given map.
*/
function removeFromMap(map, fullPath, isThirdParty){
	if(!map |! fullPath){
		return false;
	}
	
	var change = false;
	
	if(map.modules){
		var keys = Object.keys(map.modules);
		for(var i=0;i<keys.length;i++){
			var key = keys[i];
			if(key.indexOf(fullPath) === 0){
				
				// A thirdparty update will *not* remove a first party file.
				if(isThirdParty && !map.modules[key].isThirdParty){
					continue;
				}
				
				delete map.modules[key];
				change=true;
			}
		}
	}
	
	if(map.styleModules){
		var keys = Object.keys(map.styleModules);
		for(var i=0;i<keys.length;i++){
			var key = keys[i];
			if(key.indexOf(fullPath) === 0){
				
				// A thirdparty update will *not* remove a first party file.
				if(isThirdParty && !map.styleModules[key].isThirdParty){
					continue;
				}
				
				delete map.styleModules[key];
				change=true;
			}
		}
	}
	
	return change;
}

function addToMap(map, fullPath, modulePath, fileName, moduleNames, lastDirectory, isThirdParty, onDone){
	if((fileName.endsWith('.scss') ||  fileName.endsWith('.css')) && modulePath.indexOf('/static/') == -1) {
		// If the filename contains a number, add to style group x.
		var parts = fileName.split('.');
		var styleGroup = null;
		
		if (parts.length>=3) {
			styleGroup = parseInt(parts[parts.length-2]);
		}
		
		if (!styleGroup || isNaN(styleGroup)) {
			// Default is group 100:
			styleGroup = 100;
		}
		
		var scssModulePath = modulePath + '/' + fileName;
		
		// SASS transpile has to happen in one go for included variables to work correctly
		
		// 3rd party does not overwrite 1st party:
		var module = map.styleModules[scssModulePath];
		
		if(isThirdParty && module && !module.isThirdParty){
			onDone();
			return;
		}
		
		if(module){
			module.isThirdParty = isThirdParty;
		}else{
			map.styleModules[scssModulePath] = module = {isThirdParty};
		}
		
		loadFromFile(map, fullPath, scssModulePath, true, moduleNames, function(data) {
			
			data.group = styleGroup;
			data.parentModule = modulePath;
			data.isThirdParty = isThirdParty;
			map.styleModules[scssModulePath] = data;
			
			// At this point we'll remap url(..) like this:
			data.content = remapScssUrls(data.content, mapUrl(map, modulePath.toLowerCase() + '/', true));
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.styleModules[scssModulePath] = data);
			}
			
			onDone();
			
		});
	} else if (fileName == 'module.json') {
		// Got a module config file. These apply to all files in this directory.
		
		loadFromFile(map, fullPath, modulePath, true, moduleNames, function(data){
			
			data.parentModule = modulePath;
			map.moduleConfigs[modulePath] = JSON.parse(data.content);
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.moduleConfigs[modulePath] = data);
			}
			
			onDone();
		});
	
	} else if(fileName.endsWith('.js') && modulePath.indexOf('/static/') == -1) {
		var jsModulePath = modulePath + '/' + fileName;
		
		// 3rd party does not overwrite 1st party:
		var module = map.modules[jsModulePath];
		
		if(isThirdParty && module && !module.isThirdParty){
			onDone();
			return;
		}
		
		if(module){
			module.isThirdParty = isThirdParty;
		}else{
			map.modules[jsModulePath] = module = {isThirdParty};
		}
		
		// The false triggers a JS file transpile:
		loadFromFile(map, fullPath, jsModulePath, false, moduleNames, function(data){
			
			data.parentModule = modulePath;
			data.isThirdParty = isThirdParty;
			map.modules[jsModulePath] = data;
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.modules[jsModulePath] = data);
			}
			
			onDone();
		});
	
	} else if(fileName == lastDirectory + '.json') {
		// Direct inclusion of a canvas. 
		// Quite a specific name is required otherwise it will be treated as static content.
		// E.g. Pages/Main/Main.json
		
		var jsModulePath = modulePath + '/' + fileName;
		
		// 3rd party does not overwrite 1st party:
		var module = map.modules[jsModulePath];
		
		if(isThirdParty && module && !module.isThirdParty){
			onDone();
			return;
		}
		
		if(module){
			module.isThirdParty = isThirdParty;
		}else{
			map.modules[jsModulePath] = module = {isThirdParty};
		}
		
		loadFromFile(map, fullPath, jsModulePath, true, moduleNames, function(data){
			
			// Prepend exports:
			data.content = "module.exports=" + data.content + ";";
			
			data.parentModule = modulePath;
			data.isThirdParty = isThirdParty;
			map.modules[jsModulePath] = data;
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.modules[jsModulePath] = data);
			}
			
			onDone();
		});
	} else if(fileName.indexOf('.git') == -1) {
		// Static content.
		// This just needs to be copied directly to the target dir.
		
		copyStaticFile(fullPath, map.config.outputStaticPath + modulePath.toLowerCase() + '/' + fileName, true, function(){
			// console.log(modulePath  + '/' + fileName + ' copied to public directory as static content.');
			onDone();
		});
	} else {
		// File is just ignored
		onDone();
	}
}

/*
	Directly copies from path a to b, but optionally only if it is "newer" (different size, more recently modified, didn't exist anyway). 
	Calls the given cb when it's done
*/

function copyStaticFile(fullPath, targetPath, onlyIfNewer, onDone){
	
	function copyTheFile(){
		// Make target dir if it doesn't exist:
		
		// Clean the dirs:
		fullPath = fullPath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
		targetPath = targetPath.replace(/\\/g, path.sep).replace(/\//g, path.sep);
		
		// Targeting dir:
		var targetDirectory = path.dirname(targetPath);
		
		mkdir(targetDirectory, function(err){
			
			if(err && err.code != 'EEXIST'){
				console.error(err);
				return;
			}
			
			fs.copyFile(fullPath, targetPath, (err) => {
				if(err){
					console.error(err);
					return;
				}
				
				// Ok:
				onDone();
			});
		});
		
	}
	
	if(onlyIfNewer){
		// Get file stats for both:
		
		var pending = [null,null];
		
		fs.stat(fullPath, function(err, stats){
			onStats(0, err, stats);
		});
		fs.stat(targetPath, function(err, stats){
			onStats(1, err, stats);
		});
		
		function onStats(index, err, stats){
			pending[index] = {err, stats};
			
			if(!pending[0] || !pending[1]){
				return;
			}
			
			// Copy is required if:
			// - Either errored (first one ideally never does)
			// - [0] write time is after [1] write time:
			// - They're different sizes
			if(
				pending[0].err || pending[1].err || 
				pending[0].stats.mtime > pending[1].stats.mtime ||
				pending[0].stats.size != pending[1].stats.size
			){
				// Copy required:
				copyTheFile();
			}else{
				// Copy wasn't needed - file is already up to date.
				onDone();
			}
		}
		
	}else{
		// Copy now:
		copyTheFile();
	}
	
}

var sharedContent = getSharedContent(false);
var sharedContentMin = getSharedContent(true);

function getSharedContent(mini){
	var result = fs.readFileSync(__dirname + '/babelHelpers' + (mini ? '.min' : '') + '.js', {encoding: 'utf8'});
	result += 'var babelHelpers=global.babelHelpers;var React=global.React=(function(){var module = {};var exports = {};module.exports = exports;\r\n' + fs.readFileSync(__dirname + '/preact' + (mini ? '.min' : '') + '.js', {encoding: 'utf8'}) + '\r\nreturn module.exports;})();';
	result += fs.readFileSync(__dirname + '/preact.hooks.min.js', {encoding: 'utf8'}) + '\r\n;';
	return result;
}

function build(config){
	
	return new Promise((success, reject) => {
		var errors = [];
		
		if(!config.errorsAreWarnings){
			config.onError = (e) => {
				errors.push(e);
			};
		}
		
		var map = {modules: {}, moduleConfigs: {}, styleModules: {}, config, onChange: []};
		
		// moduleNames is the complete set of referenced major modules (i.e. itself and any included ones). Typically e.g. ["UI", "Admin"].
		config.moduleNames = [config.moduleName];
		
		if(config.include){
			config.moduleNames = config.moduleNames.concat(config.include.map(includedMap => includedMap.config.moduleName));
			
			// config.include is an array of map objects.
			config.include.forEach(includedMap => {
				// Drop in its modules and styleModules unless they're specifically excluded from this module.
				
				if(!includedMap.includedBy){
					includedMap.includedBy = [];
				}
				
				includedMap.includedBy.push(map);
				
				includedMap.onChange.push(() => {
					// Our map changes too when an included one does:
					buildOutput(map, {js: true, css: true});
				});
				
				for(var key in includedMap.modules){
					var inclModule = includedMap.modules[key];
					var moduleCfg = inclModule.moduleConfig;
					if(moduleCfg && moduleCfg.exclude && moduleCfg.exclude.includes(config.moduleName)){
						// This module excludes itself.
						continue;
					}
					
					map.modules[key] = inclModule;
				}
				
				for(var key in includedMap.styleModules){
					var inclModule = includedMap.styleModules[key];
					var moduleCfg = inclModule.moduleConfig;
					if(moduleCfg && moduleCfg.exclude && moduleCfg.exclude.includes(config.moduleName)){
						// This module excludes itself.
						continue;
					}
					
					map.styleModules[key] = inclModule;
				}
			});
		}
		
		loadFromDirectory(config.sourceDir, config.moduleName, map, false, function(){
			// Next, transfer collected config onto all child modules that use it.
			for(var key in map.modules){
				
				// Module is..
				var module = map.modules[key];
				
				// Get the module config (may be undefined):
				module.moduleConfig = map.moduleConfigs[module.parentModule];
				
			}
			
			buildOutput(map, {js: true, css: true});
			
			// Clear onError to prevent it potentially continuing to trigger during watches:
			config.onError = null;
			
			if(config.errorsAreWarnings){
				// Errors are warnings (typically watcher mode).
				success(map);
			}else{
				if(errors.length){
					reject({errors, map});
				}else{
					success(map);
				}
			}
		});
		
	});
	
}

/*
* Obtains a file's stats, waiting if the filesystem reports that the file is busy.
*/
function waitForStats(entry){
	
	var check = (s, r) => {
		
		fs.stat(entry, function(err, stats){
			
			if(err && err.code == 'EBUSY'){
				// file is busy. wait for it.
				setTimeout(() => {
					check(s, r);
				}, 10);
				
				return;
			}
			
			// Something difinitive happened. Return now.
			s(stats);
		})
		
	};
	
	return new Promise(check);
}

/*
* Watches the filesystem for changes, and builds when it needs to do so.
*/
function watch(config){
	config.errorsAreWarnings = true;
	return build(config).then(map => {
		
		var pendingFileUpdates = {};
		
		var fileChange = (changeType, entry) => {
			
			if(!entry){
				entry = changeType;
			}
			
			if(!entry || pendingFileUpdates[entry]){
				// Already waiting for this file, or it should just be skipped.
				return;
			}
			
			pendingFileUpdates[entry] = waitForStats(entry)
			.then(stats => {
				delete pendingFileUpdates[entry];
				
				if(stats && stats.isDirectory()){
					// Directory created (or renamed, or copied in).
					// Iterate through all of it now.
					fs.readdir(entry, (err, files) => {
						if(files){
							for(var i=0;i<files.length;i++){
								var filePath = files[i];
								fileChange(path.join(entry,filePath));
							}
						}
					});
					return;
				}
				
				entry = entry.substring(config.sourceDir.length + 1);
				
				var modulePathWithName = config.moduleName + '/' + entry.replace(/\\/g, '/');
				
				var parts = modulePathWithName.split('/');
				modulePathWithName = '';
				var isThirdParty = false;
				
				for(var i=0;i<parts.length;i++){
					var lcName = parts[i].toLowerCase();
					if(lcName == 'thirdparty'){
						isThirdParty = true;
						continue;
					}else if(lcName.endsWith('.bundle')){
						continue;
					}
					
					if(modulePathWithName != ''){
						modulePathWithName += '/';
					}
					
					modulePathWithName += parts[i];
				}
				
				var fileParts = entry.replace(/\\/g, '/').split('/');
				var fileName = fileParts[fileParts.length-1];
				var lastDirectory = fileParts.length>1 ? fileParts[fileParts.length-2] : '';
				
				var isJs = entry.endsWith('.js') || (entry == lastDirectory + '.json');
				var isCss = (entry.endsWith('.scss') || entry.endsWith('.css')) && modulePathWithName.indexOf('/static/') == -1;
				
				if (!stats) {
					
					// Remove from the module lookup:
					if(removeFromMap(map, modulePathWithName, isThirdParty)){
						enqueueBuildRequest(map, isJs, isCss);
					}
					
				} else {
					
					var fullPath = config.sourceDir + '/' + entry;
					var modulePath = path.dirname(modulePathWithName);
					
					// If it's a file we need to compile:
					if(isJs || isCss){
						
						addToMap(
							map,
							fullPath,
							modulePath,
							fileName,
							config.moduleNames,
							lastDirectory,
							isThirdParty,
							function(){
								enqueueBuildRequest(map, isJs, isCss);
							}
						);
						
					}else if(fileName.indexOf('.git') == -1){
						// Static file copy:
						copyStaticFile(fullPath, config.outputStaticPath + modulePath.toLowerCase() + '/' + fileName, false, function(){
							console.log(modulePath + '/' + fileName + ' copied to public directory as static content.');
						});
					}
				}
			});
		};
		
		nodeWatch(config.sourceDir, fileChange);
		
		return map;
	});
}

/*
* Requests to build after a file change.
* Waits for a delay because it's common for a filesystem to 
* trigger this repeatedly in quick succession.
*/
function enqueueBuildRequest(map, js, css){
	
	if(map.____buildPending){
		map.____buildPending.js |= js;
		map.____buildPending.css |= css;
		return;
	}
	
	map.____buildPending = {
		js,
		css
	};
	
	// Wait for 200ms, then run the actual build.
	setTimeout(() => {
		var buildOpts = map.____buildPending;
		map.____buildPending = null;
		buildOutput(map, buildOpts);
	}, 200);
}

function buildOutput(map, filesToBuild){
	
	var files = [];
	var buildPromises = [];
	
	if(filesToBuild.js){
		// Rebuild the JS file.
		
		var jsFile = '(function(global){';
		
		jsFile += "var __mm = global.__mm = {};function getModule(mdName){var module = __mm[mdName]; if(!module){throw new Error(mdName + \" module not found\");} if(!module.l){module.v = module.call();module.l = true;} return module.v;}global.getModule=getModule;var require=getModule;global.require=getModule;\r\n";
		
		jsFile += map.config.minified ? sharedContentMin : sharedContent;
		
		for(var key in map.modules){
			var fileContent = map.modules[key].content;
			
			jsFile += '\r\n__mm[\'' + key + '\'] = {call:(function(){';
			jsFile += 'var module={};var exports = {};module.exports=exports;';
			jsFile += fileContent;
			
			jsFile += 'return module.exports;';
			jsFile += '})};\r\n';
			
		}
		
		if(map.config.entryModule === undefined){
			jsFile += 'var s = getModule("' + map.config.moduleName + '/Start/Start.js");(s.default||s)();';
		}else if(map.config.entryModule != null){
			jsFile += 'var s = getModule("' + map.config.entryModule + '");(s.default||s)();';
		}
		
		jsFile += '})(typeof module != \'undefined\' ? module.exports : ("undefined" != typeof window ? window : ("undefined" != typeof global) ? global : null));';
		
		// Create if it doesn't exist:
		mkdir(path.dirname(map.config.outputJsPath), function(err){
			
			if(err && err.code != 'EEXIST'){
				console.error(err);
				return;
			}
			
			fs.writeFileSync(map.config.outputJsPath, jsFile);
			
			if(map.config.compress){
				fs.writeFileSync(map.config.outputJsPath + '.gz', zlib.gzipSync(jsFile));
			}else{
				fs.unlink(map.config.outputJsPath + '.gz', function(){});
			}
		});
		
		files.push({
			type: 'js',
			content: jsFile,
			path: map.config.outputJsPath
		});
	}
	
	if(filesToBuild.css){
		// Rebuild the CSS. This is order sensitive so we must sort them by group and filename.
		
		var sortedStyleModules = Object.values(map.styleModules).sort(function(a, b) {
			// Sort by group first:
			if (a.group < b.group)
			  return -1;
			else if (a.group > b.group)
			  return 1;

			// Group ID is equal. Sort by name next:
			if (a.modulePath < b.modulePath)
			  return -1;
			else if (a.modulePath > b.modulePath)
			  return 1;

			return 0;
	    });
		
		var cssFile = '';
		
		for(var moduleIndex in sortedStyleModules){
			
			cssFile += sortedStyleModules[moduleIndex].content + '\r\n';
			
		}
		
		// SASS happens in one lump due to defines/ mixins etc.
		cssFile = sassTranspile(cssFile, '', map);
		
		var cssPromise = null;
		
		if(map.config.onProcessCss){
			cssPromise = map.config.onProcessCss(cssFile, map).then(updateCssFile => {
				cssFile = updateCssFile;
			});
		}else{
			cssPromise = Promise.resolve(true);
		}
		
		cssPromise = cssPromise.then(() => {
			
			return new Promise((success, reject) => {
				
				// Create if it doesn't exist:
				mkdir(path.dirname(map.config.outputCssPath), function(err){
					
					if(err && err.code != 'EEXIST'){
						console.error(err);
						return;
					}
					
					fs.writeFileSync(map.config.outputCssPath, cssFile);
					
					if(map.config.compress){
						fs.writeFileSync(map.config.outputCssPath + '.gz', zlib.gzipSync(cssFile));
					}else{
						fs.unlink(map.config.outputCssPath + '.gz', function(){});
					}
					
				});
				
				files.push({
					type: 'css',
					content: cssFile,
					path: map.config.outputCssPath
				});
				
				success();
			});
			
		});
		
		buildPromises.push(cssPromise);
	}
	
	Promise.all(buildPromises).then(() => {
		// Fire change event:
		if(map.onChange){
			map.onChange.forEach(evt => evt());
		}
		
		if(map.config.onFileChange){
			map.config.onFileChange({
				map,
				files
			});
		}
		
		console.log('[' + new Date().toLocaleString() + '] Done handling ' + map.config.moduleName + ' changes');
	});
	
	
}

// babelHelpers.js is generated like so:
// var res = require("@babel/core").buildExternalHelpers();
// console.log(res);

/* preact, @babel/core, @babel/standalone, babel-preset-react, @babel/plugin-external-helpers */


module.exports = {
	build,
	watch
};