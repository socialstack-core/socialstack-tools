var Babel = require("@babel/standalone");
var fs = require('fs');
var sass = require('sass');
var path = require('path');
var nodeWatch = require('recursive-watch');
var mkdir = require('./mkdir-recursive.js');

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
			
			if(fileType != 'js' && !json && fileType != 'scss' && fileType != 'css'){
				// Anything else is considered static here.
				
				builtPath.pop();
				
				var targetUrl = '/pack/modules/' + builtPath.join('/').toLowerCase() + '/' + lastPart;
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

function transpile(text, modulePath, moduleNames){
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
				presets: ['es2015', 'react'],
				plugins: [importPlug, 'external-helpers'],
				comments: false,
				minified: true
			}
		).code;
	}catch(e){
		var errorMessage = e.toString();
		console.error("[" + modulePath + "] " + errorMessage);
		return "throw new Error(\"[" + modulePath + "] " + errorMessage.replace(/\r/g,'\\r').replace(/\n/g, '\\n') + "\");";
	}
}

function sassTranspile(fileContent, modulePath){
	try{
		return sass.renderSync({
		  data: fileContent
		}).css.toString();
	}catch(e){
		var errorMessage = e.toString();
		console.error("[" + modulePath + "] " + errorMessage);
		
		// Output bad CSS so the error appears on the frontend too:
		return "\r\n[" + modulePath + "] " + errorMessage + "\r\n";
	}
}

function loadFromFile(filePath, modulePath, useRaw, moduleNames, onLoaded) {
	
	fs.readFile(filePath, {encoding: 'utf8'}, function(err, fileContent){
		
		onLoaded({
			filePath,
			modulePath,
			content: useRaw ? fileContent : transpile(fileContent, modulePath, moduleNames)
		});
		
	});
	
}

function loadFromDirectory(dirPath, modulePath, map, moduleNames, onDone) {

	var dirParts = dirPath.replace(/\\/g, '/').split('/');
	var lastDirectory = dirParts[dirParts.length-1];
	
	fs.readdir(dirPath, (err, list) => {
		
		var pending = list.length;
		
		list.forEach(entry => {
			
			var fullPath = dirPath + '/' + entry;
			
			fs.stat(fullPath, (err, stats) => {
				
				if(stats.isDirectory()){
					
					var newModulePath = (entry.toLowerCase() == 'thirdparty') ? modulePath : modulePath + '/' + entry;
					
					// Handle the directory:
					loadFromDirectory(fullPath, newModulePath, map, moduleNames, function(){
						
						pending--;
						
						if(pending == 0){
							onDone();
						}
						
					});
					
				}else{
					// Entry is a file.
					var pieces = entry.split('.');
					
					// Add it to the mapping now:
					addToMap(map, fullPath, modulePath, entry, moduleNames, lastDirectory, function(){
						pending--;
						
						if(pending == 0){
							onDone();
						}
					});
					
				}
				
			});
			
		});
		
		return;
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

function addToMap(map, fullPath, modulePath, fileName, moduleNames, lastDirectory, onDone){
	if(fileName.endsWith('.scss') ||  fileName.endsWith('.css')) {
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
		
		loadFromFile(fullPath, scssModulePath, true, moduleNames, function(data) {
			
			data.group = styleGroup;
			data.parentModule = modulePath;
			map.styleModules[scssModulePath] = data;
			
			// At this point we'll remap url(..) like this:
			data.content = remapScssUrls(data.content, '/pack/modules/' + modulePath.toLowerCase() + '/');
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.styleModules[scssModulePath] = data);
			}
			
			onDone();
			
		});
	} else if (fileName == 'module.json') {
		// Got a module config file. These apply to all files in this directory.
		
		loadFromFile(fullPath, modulePath, true, moduleNames, function(data){
			
			data.parentModule = modulePath;
			map.moduleConfigs[modulePath] = JSON.parse(data.content);
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.moduleConfigs[modulePath] = data);
			}
			
			onDone();
		});
	
	} else if(fileName.endsWith('.js')) {
		var jsModulePath = modulePath + '/' + fileName;
		
		// The false triggers a JS file transpile:
		loadFromFile(fullPath, jsModulePath, false, moduleNames, function(data){
			
			data.parentModule = modulePath;
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
		
		loadFromFile(fullPath, jsModulePath, true, moduleNames, function(data){
			
			// Prepend exports:
			data.content = "module.exports=" + data.content;
			
			data.parentModule = modulePath;
			map.modules[jsModulePath] = data;
			
			if(map.includedBy){
				map.includedBy.forEach(inclIn => inclIn.modules[jsModulePath] = data);
			}
			
			onDone();
		});
	} else {
		// Static content.
		// This just needs to be copied directly to the target dir.
		
		copyStaticFile(fullPath, map.config.outputStaticPath + modulePath.toLowerCase() + '/' + fileName, true, function(){
			// console.log(modulePath  + '/' + fileName + ' copied to public directory as static content.');
			onDone();
		});
		
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

var sharedContent = fs.readFileSync('./buildwatch/babelHelpers.js', {encoding: 'utf8'});
sharedContent += 'var babelHelpers = global.babelHelpers;var React = global.React = (function(){var module = {};\r\n' + fs.readFileSync('./buildwatch/preact.min.js', {encoding: 'utf8'}) + '\r\nreturn module.exports;})();';

function build(config){
	
	return new Promise((success, reject) => {
		
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
		
		loadFromDirectory(config.sourceDir, config.moduleName, map, config.moduleNames, function(){
			
			// Next, transfer collected config onto all child modules that use it.
			for(var key in map.modules){
				
				// Module is..
				var module = map.modules[key];
				
				// Get the module config (may be undefined):
				module.moduleConfig = map.moduleConfigs[module.parentModule];
				
			}
			
			buildOutput(map, {js: true, css: true});
			
			success(map);
		});
		
	});
	
}

function watch(config){
	return build(config).then(map => {
		
		nodeWatch(config.sourceDir, function(changeType, entry){
			
			setTimeout(function(){
				
				if(!entry){
					entry = changeType;
				}
				
				var exists = fs.existsSync(entry);
				
				entry = entry.substring(config.sourceDir.length + 1);
				
				var modulePathWithName = config.moduleName + '/' + entry.replace(/\\/g, '/');
				
				var parts = modulePathWithName.split('/');
				modulePathWithName = '';
				for(var i=0;i<parts.length;i++){
					if(parts[i].toLowerCase() == 'thirdparty'){
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
				var isCss = entry.endsWith('.scss') || entry.endsWith('.css');
				
				if (!exists) {
					// Remove from the module lookup:
					if(map[modulePathWithName]){
						delete map[modulePathWithName];
						buildOutput(map, {js: isJs, css: isCss});
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
							function(){
								buildOutput(map, {js: isJs, css: isCss});
							}
						);
						
					}else{
						// Static file copy:
						copyStaticFile(fullPath, config.outputStaticPath + modulePath.toLowerCase() + '/' + fileName, false, function(){
							console.log(modulePath + '/' + fileName + ' copied to public directory as static content.');
						});
					}
				}
			
			}, 80); // 80ms debounce
		});
		
		return map;
	});
}

function buildOutput(map, filesToBuild){
	
	if(filesToBuild.js){
		// Rebuild the JS file.
		
		var jsFile = '(function(global){';
		
		jsFile += "var __mm = global.__mm = {};function require(mdName){var module = __mm[mdName]; if(!module){throw new Error(mdName + \" module not found\");} if(!module.l){module.v = module.call();module.l = true;} return module.v;}\r\n";
		
		jsFile += sharedContent;
		
		for(var key in map.modules){
			var fileContent = map.modules[key].content;
			
			jsFile += '\r\n__mm[\'' + key + '\'] = {call:(function(){';
			jsFile += 'var exports = {};';
			jsFile += fileContent;
			
			jsFile += 'return exports;';
			jsFile += '})};\r\n';
			
		}
		
		jsFile += 'require("' + map.config.moduleName + '/Start/Start.js");';
		jsFile += '})(typeof module != \'undefined\' ? module.exports : window);';
		
		fs.writeFileSync(map.config.outputJsPath, jsFile);
		
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
		fs.writeFileSync(map.config.outputCssPath, sassTranspile(cssFile, ''));
		
	}
	
	// Fire change event:
	if(map.onChange){
		map.onChange.forEach(evt => evt());
	}
	
	console.log('[' + new Date().toLocaleString() + '] Done handling ' + map.config.moduleName + ' changes');
	
}

// babelHelpers.js is generated like so:
// var res = require("@babel/core").buildExternalHelpers();
// console.log(res);

/* preact, @babel/core, @babel/standalone, babel-preset-react, @babel/plugin-external-helpers */


module.exports = {
	build,
	watch
};