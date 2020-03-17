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

// React-lite-builder is also a socialstack project.
// It'll let you use Socialstack's UI modules without a Socialstack server if you use it directly.
var buildwatch = require('react-lite-builder').buildwatch;

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
		{name: 'buildui', alias: 'b'},
		{name: 'install', alias: 'i'},
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
				console.error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI and an Api directory to be a project.');
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
		findProjectRoot(config, start);
	}
	
}

/*
 publicUrl: the base path of the URL where the publicDir is accessible from.
 publicDir: the filepath to the public directory
 fileInfo: the info for the raw changed set of files, provided by the builder.
*/
function updateIndex(publicUrl, fileInfo, publicDir){
	
	// First try to read the index.html file:
	fs.readFile(publicDir + '/index.html', 'utf8', function(err, contents){
		
		if(err){
			// Doesn't exist or otherwise isn't readable.
			console.log('Info: Error when trying to read index.html: ', err);
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
		
		if(originalContents != contents){
			
			// Write it back out:
			fs.writeFile(publicDir + '/index.html', contents, function(err){
				
				err && console.error(err);
				
			});
			
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
	
	var uiPromise = buildwatch[isWatch ? 'watch' : 'build']({
		sourceDir,
		moduleName,
		relativePaths: config.relativePaths,
		outputStaticPath: outputDir + 'modules/',
		outputCssPath: outputDir + 'styles.css',
		outputJsPath: outputDir + 'main.generated.js',
		onFileChange: (info) => {
			// Inject into index.html:
			updateIndex('/pack/', info, publicDir);
		}
	});
	
	uiPromise.then(uiMap => {
		
		// Admin panel (depends on UI modules):
		var sourceDir = config.projectRoot + '/Admin/Source';
		var publicDir = config.projectRoot + '/Admin/public/en-admin';
		var outputDir = publicDir + '/pack/';
		var moduleName = 'Admin';
		
		buildwatch[isWatch ? 'watch' : 'build']({
			include: [uiMap],
			sourceDir,
			moduleName,
			relativePaths: config.relativePaths,
			outputStaticPath: outputDir + 'modules/',
			outputCssPath: outputDir + 'styles.css',
			outputJsPath: outputDir + 'main.generated.js',
			onFileChange: (info) => {
				// Inject into index.html:
				updateIndex('/en-admin/pack/', info, publicDir);
			}
		});
		
	});
	
}

function start(config){
	
	var isWatch = config.commandLine.command == 'watch';
	
	if(isWatch || config.commandLine.command == 'buildui'){
		
		if(config.commandLine.relativePaths){
			config.relativePaths = true;
		}
		
		watchOrBuild(config, isWatch);
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
		
	}else if(config.commandLine.command == 'render'){
		// Renders UI's (this typically actually happens over the interactive mode below).
		
		var serverrender = require('./serverrender/index.js');
		
		var renderer = serverrender.getRenderer(config);
		
		// (url/ canvas are optional - only need one or the other):
		var url = config.commandLine.url;
		var canvas = config.commandLine.canvas;
		
		if(!url && !canvas){
			console.error("Please provide either -url or -canvas to render.");
		}
		
		if(url){
			url = url[0];
		}
		
		if(canvas){
			canvas = canvas[0];
		}
		
		var home = renderer.render({url, canvas, context:{}});
		
		console.log(home);
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
			if (err) throw err;
			
			var settingsPath = adp + path.sep + 'settings.json';
			
			var username = config.commandLine.u ? config.commandLine.u[0] : 'root';
			var pwd = config.commandLine.p ? config.commandLine.p[0] : '';
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
			))
			
		});
		
	}else if(config.commandLine.command == 'init' || config.commandLine.command == 'create'){
		
		var create = require('./create/index.js');
		
		create(config);
	
	}else if(config.commandLine.command == 'add' || config.commandLine.command == 'share'){
		
		// Pushes *this directory* up to the source repository for global publishing.
		// socialstack add -d "A description of the module here."
		
		var add = require('./add/index.js');
		add(config);
		
	}else if(config.commandLine.command == 'install'){
		
		// Install a module.
		var install = require('./install/index.js');
		install(config);
		
	}else if(config.commandLine.command == 'migrate'){
		
		var migrate = require('./migrate/index.js');
		
		migrate(config);
		
	}else if(config.commandLine.command == 'interactive'){
		// Interactive mode. We'll send and receive data over a raw TCP socket.
		// The other end is the server, so one host site can have multiple node processes at once.
		
		var serverrender = require('./serverrender/index.js');
		
		var renderer = serverrender.getRenderer(config);
		
		if(!config.commandLine.p){
			console.error('-p port is a required field.');
			return;
		}
		
		var port = parseInt(config.commandLine.p[0]);
		
		// A numeric ID for the process to identify itself with:
		var id = config.commandLine.id ? parseInt(config.commandLine.id[0]) : undefined;
		
		var interactive = require('./interactive/index.js');
		
		interactive({port, id, onRequest: function(message){
			
			var action = message.request.action;
			
			if(action == "render"){
				// Render the page now (url/ canvas are optional - only need one or the other):
				var page = renderer.render({
					url: message.request.url,
					canvas: message.request.canvas,
					context: message.request.context
				});
				
				// Send the response:
				message.response(page);
			}else if(action == "watch"){
				watchOrBuild(config, true);
				message.response({success: true});
			}
			
		}});
		
	}
	
}