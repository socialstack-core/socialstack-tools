// ===========================================
// SocialStack tools entry point - the magic begins here
//                      __                                ___         ___             _
// ___________ ________/  |_ ___ __    ____   ____     __| _/_ __  __| _/____   _____| |
// \____ \__  \\_  __ \   __<   |  |  /  _ \ /    \   / __ |  |  \/ __ |/ __ \ /  ___/ |
// |  |_> > __ \|  | \/|  |  \___  | (  <_> )   |  \ / /_/ |  |  / /_/ \  ___/ \___ \ \|
// |   __(____  /__|   |__|  / ____|  \____/|___|  / \____ |____/\____ |\___  >____  >__
// |__|       \/             \/                  \/       \/          \/    \/     \/ \/
// ===========================================

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
const { spawn } = require('child_process');

// React-lite-builder is also a socialstack project.
// It'll let you use Socialstack's UI modules without a Socialstack server if you use it directly.
var buildwatch = require('react-lite-builder').buildwatch;

// Used for rendering React by command.
// This is referenced out here such that any JS rebuilds can simply clear this variable.
var renderer = null;

/*
* Converts the raw command line args into operation/ flag set.
*/
function mapArgs()
{
	var args = process.argv;
	var result = {
		command: 'watch'
	};
	
	if (args.length<=2) {
		return result;
	}
	
	result.command = args[2].toLowerCase();
	
	var commandOps = [
		{name: 'watch', alias: 'w'},
		{name: 'build', alias: 'b'},
		{name: 'buildui'},
		{name: 'buildapi'},
		{name: 'install', alias: 'i'},
		{name: 'uninstall'},
		{name: 'init'},
		{name: 'create', alias: 'c'},
		{name: 'configuration'},
		{name: 'configure'},
		{name: 'migrate', alias: 'm'},
		{name: 'interactive'},
		{name: 'render', alias: 'r'},
		{name: 'add', alias: 'a'},
		{name: 'share', alias: 's'},
		{name: 'version', alias: 'v'},
		{name: 'generate', alias: 'g'},
		{name: 'where'},
		{name: 'id'}
	];
	
	var cmdOp = null;
	
	for(var i=0;i<commandOps.length;i++){
		var op = commandOps[i];
		
		if(result.command == op.name || result.command == op.alias){
			// Got it!
			cmdOp = op;
			result.command = op.name;
			break;
		}
	}
	
	if(cmdOp == null){
		throw new Error('Unrecognised command: ' + result.command);
	}
	
	// Handle flags:
	var lastFlag = null;
	
	for (var i=3;i<args.length;i++) {
		var argVal = args[i];
		
		if (argVal.length>1 && argVal[0] =='-') {
			lastFlag = argVal.substring(1);
			result[lastFlag] = [];
		} else {
			if(!lastFlag){
				lastFlag = '-';
				
				if(!result['-']){
					result['-'] = [];
				}
			}
			
			result[lastFlag].push(argVal);
		}
	}
	
	return result;
}

/*
* Checks if the given directory is a socialstack project root.
* Calls the given callback as callback(isRoot) where isRoot is true/false.
*/
function isProjectRoot(dirPath, callback){
	// The root can be identified by looking for the dir with 'UI' and 'Api' child directories.
	var pending = 2;
	var matchesRequired = 2;
	
	function dirReturn(err, stats){
		pending--;
		if(!err && stats.isDirectory()){
			matchesRequired--;
		}
		
		if(pending == 0){
			callback(matchesRequired == 0);
		}
	}
	
	fs.stat(dirPath + '/UI', dirReturn);
	fs.stat(dirPath + '/Api', dirReturn);
}

/*
* Finds the project root directory, or errors if it wasn't possible.
* Calls the given done callback as done(config) if it was successful.
*/
function findProjectRoot(config, done){
	var currentPath = config.calledFromPath;
	
	function onCheckedRoot(success){
		if(success){
			config.projectRoot = currentPath;
			done(config);
		}else{
			var nextPath = path.dirname(currentPath);
			
			if(currentPath == nextPath){
				// Nope!
				done(null);
				return;
			}else{
				currentPath = nextPath;
				isProjectRoot(currentPath, onCheckedRoot);
			}
		}
	}
	
	isProjectRoot(currentPath, onCheckedRoot);
}

var commandsThatWorkWithoutBeingInAProject = {
	'create': true,
	'init': true,
	'version': true,
	'configuration': true,
	'configure': true,
	'id': true
};

module.exports = (config) => {
	
	// Map args:
	config.commandLine = mapArgs();
	
	// Commands like "create" or "version" don't need to be in a project:
	if(commandsThatWorkWithoutBeingInAProject[config.commandLine.command]){
		// Directly start it:
		start(config);
	}else{
		// Find the project root next.
		findProjectRoot(config, (result) => {
			if(!result){
				console.error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI and an Api directory to be a project.');
				return;
			}
			
			start(config);
		});
	}
	
}

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
		return;
	}
	
	buildwatch[isWatch ? 'watch' : 'build']({
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
					renderer = null;
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

function buildUI(config, isWatch){
	if(config.commandLine.relativePaths){
		config.relativePaths = true;
	}
	
	config.minified = (config.commandLine.prod || config.commandLine.minified) ? true : false;
	config.compress = (config.commandLine.prod || config.commandLine.compress) ? true : false;
	
	watchOrBuild(config, isWatch);
}

function buildAPI(config){
	// Output into Api/build by default (unless told otherwise)
	
	//  dotnet publish Api.csproj -o obj/tm
	const child = spawn('dotnet', ['publish', 'Api.csproj', '-o', 'Api/build'], {
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
		console.log('API build finished');
	});
}

function start(config){
	
	var isWatch = config.commandLine.command == 'watch';
	
	if(isWatch || config.commandLine.command == 'buildui'){
		buildUI(config, isWatch);
	}else if(config.commandLine.command == 'buildapi'){
		buildAPI(config);
	}else if(config.commandLine.command == 'build'){
		
		// Builds both API and UI
		if(config.commandLine.prod){
			config.minified = true;
			config.compress = true;
		}
		
		if(!config.commandLine.noUI){
			// Build UI:
			watchOrBuild(config, false);
		}
		
		if(!config.commandLine.noApi){
			// Build API:
			buildAPI(config);
		}
		
		if(!config.commandLine.noApp){
			// Build cordova app (if there is one):
		}
		
	}else if(config.commandLine.command == 'id'){
		
		var getContentTypeId = require('./getContentTypeId.js');
		
		var contentTypes = config.commandLine['-'];
		
		if(!contentTypes || !contentTypes.length){
			console.log("Provide the content type names you'd like the ID for. For example, 'socialstack id User'");
		}
		
		for(var i=0;i<contentTypes.length;i++){
			
			var type = contentTypes[i];
			
			console.log(type + ': ' + getContentTypeId(type));
			
		}
	}else if(config.commandLine.command == 'generate'){
		
		// Generate a module.
		var generate = require('./generate/index.js');
		generate(config);
		
	}else if(config.commandLine.command == 'where'){
		
		// Just outputs the project directory.
		console.log(config.projectRoot);
		
	}else if(config.commandLine.command == 'render'){
		// Renders UI's (this typically actually happens over the interactive mode below).
		
		var serverrender = require('./serverrender/index.js');
		
		renderer = serverrender.getRenderer(config);
		
		var canvas = config.commandLine.canvas;
		
		if(!canvas){
			console.error("Please provide -canvas to render.");
			return;
		}
		
		if(canvas){
			canvas = canvas[0];
		}
		
		var context = config.commandLine.context;
		
		if(context){
			context = JSON.parse(context[0]);
		}else{
			context = {};
		}
		
		renderer.render({canvas, context}).then(result => {
			console.log(result);
		});
		
	}else if(config.commandLine.command == 'version'){
		
		// Output the version and quit.
		var info = require('./package.json');
		console.log(info.version);
		
	}else if(config.commandLine.command == 'configuration'){
		
		var adp = require('appdata-path')('socialstack');
		var settingsPath = adp + path.sep + 'settings.json';
		
		console.log(settingsPath);
		
	}else if(config.commandLine.command == 'configure'){
		
		var adp = require('appdata-path')('socialstack');
		
		// Ensure dir exists:
		fs.mkdir(adp, { recursive: true }, (err) => {
			if (err && err.code != 'EEXIST') throw err;
			
			var settingsPath = adp + path.sep + 'settings.json';
			
			var username = config.commandLine.u ? config.commandLine.u[0] : 'root';
			var password = config.commandLine.p ? config.commandLine.p[0] : undefined;
			var server = config.commandLine.s ? config.commandLine.s[0] : 'localhost';
			
			// Write to it:
			fs.writeFile(settingsPath, JSON.stringify(
				{
					databases: {
						local: {
							username,
							password,
							server
						}
					}
				},
				null,
				'\t'
			), () => {
				console.log('Socialstack tools configured');
			})
			
		});
		
	}else if(config.commandLine.command == 'init' || config.commandLine.command == 'create'){
		
		// If already a ss dir, stop:
		findProjectRoot(config, (result) => {
			
			if(result && (!config.commandLine.dbMode || config.commandLine.dbMode[0] != 'continue')){
				console.log('There\'s already a socialstack project in your working directory - doing nothing.');
			}else{
				var create = require('./create/index.js');
				create(config);
			}
			
		});
		
	}else if(config.commandLine.command == 'add' || config.commandLine.command == 'share'){
		
		// Pushes *this directory* up to the source repository for global publishing.
		// socialstack add -d "A description of the module here."
		
		var add = require('./add/index.js');
		add(config);
		
	}else if(config.commandLine.command == 'install'){
		
		// Install a module.
		var install = require('./install/index.js');
		install(config);
		
	}else if(config.commandLine.command == 'uninstall'){
		
		// Uninstall a module.
		var uninstall = require('./uninstall/index.js');
		uninstall(config);
		
	}else if(config.commandLine.command == 'migrate'){
		
		var migrate = require('./migrate/index.js');
		
		migrate(config);
		
	}else if(config.commandLine.command == 'interactive'){
		// Interactive mode. We'll send and receive data over stdio.
		// The other end is the server, so one host site can have multiple node processes at once.
		
		var serverrender = require('./serverrender/index.js');
		
		if(config.commandLine.p){
			console.error('Obsolete usage of socialstack tools. Upgrade your Api/StackTools module to continue using this version of socialstack tools.');
			return;
		}
		
		if(config.commandLine.parent){
			config.parent = config.commandLine.parent[0];
		}
		
		var interactive = require('./interactive/index.js');
		
		interactive({onRequest: function(message){
			
			var action = message.request.action;
			
			if(action == "render"){
				
				var toRender;
				
				if(message.request.multiple){
					// This is an array of [canvas, context].
					toRender = message.request.multiple;
				}else if(message.request.contexts){
					// This is an array of contexts, but one canvas.
					var { canvas } = message.request;
					toRender = message.request.contexts.map(context => {
						
						return {
							context,
							canvas
						};
					})
				}else{
					toRender = [{
						canvas: message.request.canvas,
						context: message.request.context
					}];
				}
				
				// Get or setup a renderer:
				if(renderer == null){
					// Note: Renderer is in the 'global' scope such that a js file rebuild forces a new renderer instance.
					renderer = serverrender.getRenderer(config);
				}
				
				// Request to render them now:
				var pendingRenders = toRender.map(renderer.render);
				
				Promise.all(pendingRenders).then(results => {
					
					// Send the response:
					message.response({
						results
					});
					
				});
				
			}else if(action == "watch"){
				config.minified = message.request.prod || message.request.minified;
				config.compress = message.request.prod || message.request.compress;
				watchOrBuild(config, true);
				message.response({success: true});
			}else{
				message.response({unknown: action});
			}
			
		}});
		
	}
	
}