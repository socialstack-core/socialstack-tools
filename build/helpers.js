var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
const { spawn } = require('child_process');

var onFileBuildCallback = null;

// React-lite-builder is also a socialstack project.
// It'll let you use Socialstack's UI modules without a Socialstack server if you use it directly.
var buildwatch = require('react-lite-builder').buildwatch;

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

function watchOrBuild(config, isWatch){
	
	// Site UI:
	var sourceDir = config.projectRoot + '/UI/Source';
	var publicDir = config.projectRoot + '/UI/public';
	var outputDir = publicDir + '/pack/';
	var moduleName = 'UI';
	
	if(!fs.existsSync(sourceDir)){
		console.log('Note: We\'re running with a prebuilt UI. This is a normal mode and happens because your "UI/Source" directory doesn\'t exist. If this isn\'t intentional and you\'d like to be able to runtime update your UI modules, we tried to find it here - make sure this exists: ' + sourceDir);
		return Promise.resolve(true);
	}
	
	return buildwatch[isWatch ? 'watch' : 'build']({
		sourceDir,
		moduleName,
		minified: config.minified,
		compress: config.compress,
		relativePaths: config.relativePaths,
		outputStaticPath: outputDir + 'modules/',
		outputCssPath: outputDir + 'styles.css',
		outputJsPath: outputDir + 'main.generated.js',
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
		
		return new Promise((success, reject) => {
			
			buildwatch[isWatch ? 'watch' : 'build']({
				// include: [uiMap],
				sourceDir,
				moduleName,
				minified: config.minified,
				compress: config.compress,
				relativePaths: config.relativePaths,
				outputStaticPath: outputDir + 'modules/',
				outputCssPath: outputDir + 'styles.css',
				outputJsPath: outputDir + 'main.generated.js',
				onFileChange: (info) => {
					onFileBuildCallback && onFileBuildCallback(info);
				}
			}).then(emailMap => {
				
				success(
					{
						uiMap,
						emailMap
					}
				);
				
			}).catch(reject);
		});
		
	})
	.then(maps => {
		
		// Admin panel (depends on UI and Email modules):
		var sourceDir = config.projectRoot + '/Admin/Source';
		var publicDir = config.projectRoot + '/Admin/public/en-admin';
		var outputDir = publicDir + '/pack/';
		var moduleName = 'Admin';
		
		buildwatch[isWatch ? 'watch' : 'build']({
			include: [maps.uiMap, maps.emailMap],
			sourceDir,
			moduleName,
			minified: config.minified,
			compress: config.compress,
			relativePaths: config.relativePaths,
			outputStaticPath: outputDir + 'modules/',
			outputCssPath: outputDir + 'styles.css',
			outputJsPath: outputDir + 'main.generated.js',
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
	
	config.minified = (config.commandLine.prod || config.commandLine.minified) ? true : false;
	config.compress = (config.commandLine.prod || config.commandLine.compress) ? true : false;
	
	return watchOrBuild(config, isWatch);
}

function buildAPI(config){
	// Output into bin/Api/build by default (unless told otherwise)
	
	return new Promise((success, reject) => {
		
		//  dotnet publish Api.csproj -o obj/tm
		const child = spawn('dotnet', ['publish', 'Api.csproj', '-o', 'bin/Api/build'], {
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
			console.log('API build success');
			success();
		});
	});
}

function setBuildCallback(cb){
	onFileBuildCallback = cb;
}

module.exports = { buildAPI, buildUI, buildAll, watchOrBuild, setBuildCallback };