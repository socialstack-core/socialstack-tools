var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
const autoprefixer = require('autoprefixer');
const postcss = require('postcss');
const { spawn } = require('child_process');
var { jsConfigManager } = require('../configManager');

var onFileBuildCallback = null;

// React-lite-builder is also a socialstack project.
// It'll let you use Socialstack's UI modules without a Socialstack server if you use it directly.
var liteBuilder = require('../builder');

/*
 publicUrl: the base path of the URL where the publicDir is accessible from.
 publicDir: the filepath to the public directory
 fileInfo: the info for the raw changed set of files, provided by the builder.
*/
function updateIndex(publicUrl, fileInfo, publicDir, config){
	updateHtmlFile(publicUrl, fileInfo, publicDir, config, 'index.html', false);
	updateHtmlFile(publicUrl, fileInfo, publicDir, config, 'mobile.html', true);
}

function updateHtmlFile(publicUrl, fileInfo, publicDir, config, htmlFileName, optional){
	
	// First try to read the .html file:
	var fullFilePath = publicDir + '/' + htmlFileName;
	
	fs.readFile(fullFilePath, 'utf8', function(err, contents){
		
		if(err || !contents || !contents.length){
			// Doesn't exist or otherwise isn't readable.
			if(!optional){
				console.log('Info: Error when trying to read ' + htmlFileName + ': ', err);
			}
			return;
		}
		
		var originalContents = contents;
		
		var time = Date.now() + '';
		
		// For each file, find publicUrl + the name in contents and append ?v=... on it, where v is simply the timestamp of when this ran.
		fileInfo.files.forEach(file => {
			
			var fileName = path.basename(file.path)
			var filePublicPath = publicUrl + fileName;
			
			// This is looking for, for example, /en-admin/pack/main.generated.js?v=1.
			// It'll replace that number on the end with the current time.
			var fileRegex = new RegExp((filePublicPath + "?v=").replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([0-9]+)', 'g');
			
			contents = contents.replace(fileRegex, filePublicPath + '?v=' + time);
		});
		
		if(originalContents != contents && contents.length){
			// Write it back out:
			fs.writeFile(fullFilePath, contents, function(err){
				err && console.error(err);
			});
		}
		
		// Precompress if needed:
		if(config.compress){
			fs.writeFileSync(fullFilePath + '.gz', zlib.gzipSync(contents));
		}else{
			fs.unlink(fullFilePath + '.gz', function(){});
		}
	});
	
}

/*
* Called after the CSS has gone through SASS.
* Its job is to add any prefixes automatically.
*/
function processCss(cssFile, config){
	if(!config.__postCss){
		// Disabled.
		return Promise.resolve(cssFile);
	}
	
	return config.__postCss.process(cssFile, {from: undefined}).then(result => {
		result.warnings().forEach(warn => {
			console.warn(warn.toString())
		})
		return result.css;
	});
	
}

function getCustomBuildConfig(path){
	// Straight try to read the .json file:
	var appsettingsManager = new jsConfigManager(path + "/package.json");
	var packageJson = appsettingsManager.get();
	
	return packageJson && packageJson.scripts && packageJson.scripts.build;
}

function generateAliases(map){
	
	var aliases = 'module.exports = {\r\n';
	var entrypoint = 'global.__mm = {\r\n';
	
	for(var k in map.modules){
		
		// If this file is the "root" of a module, create an alias for it.
		
		var mod = map.modules[k];
		
		var modFilePath;
		
		var pathPieces = mod.parentModule.split('/');
		var lastPiece = pathPieces[pathPieces.length-1];
		
		// E.g. "UI" or "Admin"
		var primaryBundle = pathPieces[0];
		
		// Skip files directly in the primary bundle directory. This is, e.g. UI/entrypoint.js and UI/aliases.js:
		if(k.split('/').length<=2){
			continue;
		}
		
		if(mod.isThirdParty){
			modFilePath = primaryBundle + "/Source/ThirdParty" + k.substring(primaryBundle.length);
		}else{
			modFilePath = primaryBundle + "/Source" + k.substring(primaryBundle.length);
		}
		
		var fPathPieces = modFilePath.split('/');
		var lastFPiece = fPathPieces[fPathPieces.length-1];
		
		if(lastFPiece == lastPiece + '.js' || lastFPiece == lastPiece + '.jsx' || lastFPiece == lastPiece + '.ts' || lastFPiece == lastPiece + '.tsx'){
			aliases += '"' + mod.parentModule + '$": "' + modFilePath + '",\r\n';
			
			entrypoint += '"' + mod.parentModule + '/' + lastFPiece + '": require("' + mod.parentModule + '"),\r\n';
			
		}else{
			aliases += '"' + mod.parentModule + '/' + lastFPiece + '$": "' + modFilePath + '",\r\n';
		}
	}
	
	// console.log(aliases + '};');
	// console.log(entrypoint + '};\r\nstart();');

}

function watchOrBuild(config, isWatch){
	
	// Site UI:
	var sourceDir = config.projectRoot + '/UI/Source';
	var publicDir = config.projectRoot + '/UI/public';
	var outputDir = publicDir + '/pack/';
	var moduleName = 'UI';
	
	// If either a package.json exists in projectRoot or the UI folder, check if it contains a custom build cmd.
	// If it does, reject the request unless config.force is true.
	if(!config.force && (getCustomBuildConfig(config.projectRoot) || getCustomBuildConfig(config.projectRoot + '/UI'))){
		console.log('Note: UI build/ watch was not started because the project has custom build configuration. See the project readme or ask the project owner for how the UI should be built. This happens because the project has a package.json with a "build" script in it. You can force this build to proceed anyway with -force.');
		return Promise.resolve(true);
	}
	
	if(!fs.existsSync(sourceDir)){
		console.log('Note: We\'re running with a prebuilt UI. This is a normal mode and happens because your "UI/Source" directory doesn\'t exist. If this isn\'t intentional and you\'d like to be able to runtime update your UI modules, we tried to find it here - make sure this exists: ' + sourceDir);
		return Promise.resolve(true);
	}
	
	// Temporary workaround whilst the old build chain is depr but still used, and for where both should use the same set of cmd args.
	// If project contains new build system, use modular mode.
	
	if(fs.existsSync(config.projectRoot + '/Api/ThirdParty/CanvasRenderer/compiler.generated.js')){
		config.bundled = false;
	}
	
	if(!config.bundled){
		
		// Ask for a modular build for 3 bundles:
		return liteBuilder.modular.build({
			bundles: ["UI", "Admin", "Email"],
			projectRoot: config.projectRoot,
			minified: config.minified
		});
		
	}
	
	console.log("Using depreciated full bundle mode. Consider using -modular for increased page load performance on modern browsers.");
	
	// Load the site config:
	// If it includes "autoprefixer", then autoprefixer will be turned on for this project.
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
	var appsettings = appsettingsManager.get();
	
	// Add "autoprefixer" to your appsettings.json to enable autoprefixer. It's just true, or a browserslist.
	if(appsettings.autoprefixer){
		console.log('[INFO] CSS autoprefixer is on');
		var list = appsettings.browsers || appsettings.autoprefixer;
		
		if(!Array.isArray(list)){
			list = ['defaults'];
		}
		
		config.__postCss = postcss([ autoprefixer({overrideBrowserslist: list, browsers: list}) ]);
	}
	
	var buildwatch = liteBuilder.buildwatch;
	
	var doIndex = config.minified && !config.noIndexUpdate;
	
	return buildwatch[isWatch ? 'watch' : 'build']({
		sourceDir,
		moduleName,
		minified: config.minified,
		compress: config.compress,
		relativePaths: config.relativePaths,
		baseUrl: config.baseUrl,
		outputStaticPath: outputDir + 'modules/',
		outputCssPath: outputDir + 'styles.css',
		outputJsPath: outputDir + 'main.generated.js',
		onProcessCss: cssFile => {
			return processCss(cssFile, config);
		},
		onFileChange: (info) => {
			// Inject into index.html (and mobile.html if it exists):
			if(config.minified && !config.noIndexUpdate){
				updateIndex('/pack/', info, publicDir, config);
			}
		}
	})
	.then(uiMap => {
		
		// Email modules:
		var sourceDir = config.projectRoot + '/Email/Source';
		var publicDir = config.projectRoot + '/Email/public';
		var outputDir = publicDir + '/pack/';
		var moduleName = 'Email';
		
		return buildwatch[isWatch ? 'watch' : 'build']({
			// include: [uiMap],
			sourceDir,
			moduleName,
			minified: config.minified,
			compress: config.compress,
			relativePaths: config.relativePaths,
			baseUrl: config.baseUrl,
			outputStaticPath: outputDir + 'modules/',
			outputCssPath: outputDir + 'styles.css',
			outputJsPath: outputDir + 'main.generated.js',
			onProcessCss: cssFile => {
				return processCss(cssFile, config);
			},
			onFileChange: (info) => {
				onFileBuildCallback && onFileBuildCallback(info);
			}
		}).then(emailMap => {
			
			return {
				uiMap,
				emailMap
			};
			
		});
		
	})
	.then(maps => {
		
		// Admin panel (depends on UI and Email modules):
		var sourceDir = config.projectRoot + '/Admin/Source';
		var publicDir = config.projectRoot + '/Admin/public/en-admin';
		var outputDir = publicDir + '/pack/';
		var moduleName = 'Admin';
		
		return buildwatch[isWatch ? 'watch' : 'build']({
			include: [maps.uiMap, maps.emailMap],
			sourceDir,
			moduleName,
			minified: config.minified,
			compress: config.compress,
			relativePaths: config.relativePaths,
			baseUrl: config.baseUrl,
			outputStaticPath: outputDir + 'modules/',
			outputCssPath: outputDir + 'styles.css',
			outputJsPath: outputDir + 'main.generated.js',
			onProcessCss: cssFile => {
				return processCss(cssFile, config);
			},
			onFileChange: (info) => {
				// Inject into index.html (and mobile.html if it exists):
				if(config.minified && !config.noIndexUpdate){
					updateIndex('/en-admin/pack/', info, publicDir, config);
				}
			}
		});
	});
	
}

function buildAll(opts, config){
	opts = opts || {};
	var promises = [];
	
	config.minified = (opts.prod || opts.minified) ? true : false;
	config.compress = (opts.prod || opts.compress) ? true : false;
	config.bundled = (opts.bundled) ? true : false;
	
	if(!opts.noUi){
		// Build UI:
		promises.push(watchOrBuild(config, false));
	}
	
	if(!opts.noApi){
		// Build API:
		promises.push(buildAPI(config));
	}
	
	if(!opts.noApp){
		// Build cordova app (if there is one):
	}
	
	return Promise.all(promises);
}

function buildUI(config, isWatch){
	if(config.commandLine.relativePaths){
		config.relativePaths = true;
	}
	
	if(config.commandLine.old || config.commandLine.bundled){
		config.bundled = true;
	}
	
	if(config.commandLine.baseUrl){
		config.baseUrl = Array.isArray(config.commandLine.baseUrl) ? config.commandLine.baseUrl[0] : config.commandLine.baseUrl;
	}
	
	config.minified = (config.commandLine.prod || config.commandLine.minified) ? true : false;
	config.compress = (config.commandLine.prod || config.commandLine.compress) ? true : false;
	
	return watchOrBuild(config, isWatch);
}

function buildAPI(config){
	// Output into bin/Api/build by default (unless told otherwise)
	
	return new Promise((success, reject) => {
		
		//  dotnet publish Api.csproj -o obj/tm
		const child = spawn('dotnet', ['publish', 'Api.csproj', '-o', 'bin/Api/build', '-c', 'Release'], {
			cwd: config.projectRoot
		});
		
		// Change encoding to text:
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		
		child.stdout.on('data', (chunk) => {
		  // data from standard output is here as buffers
		  console.log(chunk);
		});
		
		// since these are streams, you can pipe them elsewhere
		child.stderr.on('data', (chunk) => {
		  // data from standard output is here as buffers
		  console.log(chunk);
		});
		
		child.on('close', (code) => {
			if(!code){
				console.log('API build success');
				success();
			}else{
				reject('API build failed. See above for more details.');
			}
		});
	});
}

function setBuildCallback(cb){
	onFileBuildCallback = cb;
}

module.exports = { buildAPI, buildUI, buildAll, watchOrBuild, setBuildCallback };