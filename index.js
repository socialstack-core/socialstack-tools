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
		{name: 'migrate', alias: 'm'},
		{name: 'interactive'},
		{name: 'render', alias: 'r'}
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
				throw new Error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI and an Api directory to be a project.');
			}else{
				currentPath = nextPath;
				isProjectRoot(currentPath, onCheckedRoot);
			}
		}
	}
	
	isProjectRoot(currentPath, onCheckedRoot);
}

module.exports = (config) => {
	
	// Map args:
	config.commandLine = mapArgs();
	
	// Everything except create (aka init) should find the root:
	if(config.commandLine.command == 'create' || config.commandLine.command == 'init'){
		// Directly start it:
		start(config);
	}else{
		// Find the project root next.
		findProjectRoot(config, start);
	}
	
}

function watchOrBuild(config, isWatch){
	
	// Site UI:
	var sourceDir = config.projectRoot + '/UI/Source';
	var outputDir = config.projectRoot + '/UI/public/pack/';
	var moduleName = 'UI';
	
	var builder = require('./buildwatch/index.js');
	
	if(!fs.existsSync(sourceDir)){
		console.log('Note: We\'re running with a prebuilt UI. This is a normal mode and happens because your "UI/Source" directory doesn\'t exist. If this isn\'t intentional and you\'d like to be able to runtime update your UI modules, we tried to find it here - make sure this exists: ' + sourceDir);
		return;
	}
	
	var uiPromise = builder[isWatch ? 'watch' : 'build']({
		sourceDir,
		moduleName,
		relativePaths: config.relativePaths,
		outputStaticPath: outputDir + 'modules/',
		outputCssPath: outputDir + 'styles.css',
		outputJsPath: outputDir + 'main.generated.js'
	});
	
	uiPromise.then(uiMap => {
		
		// Admin panel (depends on UI modules):
		sourceDir = config.projectRoot + '/Admin/Source';
		outputDir = config.projectRoot + '/Admin/public/en-admin/pack/';
		moduleName = 'Admin';
		
		var builder = require('./buildwatch/index.js');
		
		builder[isWatch ? 'watch' : 'build']({
			include: [uiMap],
			sourceDir,
			moduleName,
			relativePaths: config.relativePaths,
			outputStaticPath: outputDir + 'modules/',
			outputCssPath: outputDir + 'styles.css',
			outputJsPath: outputDir + 'main.generated.js'
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
	}else if(config.commandLine.command == 'init' || config.commandLine.command == 'create'){
		
		var create = require('./create/index.js');
		
		create(config);
		
	}else if(config.commandLine.command == 'migrate'){
		
		var migrate = require('./migrate/index.js');
		
		migrate(config);
		
	}else if(config.commandLine.command == 'interactive'){
		// Interactive mode. We'll send and receive data over a raw TCP socket.
		// This node process is the server.
		
		var port = 17061;
		
		var serverrender = require('./serverrender/index.js');
		
		var renderer = serverrender.getRenderer(config);
		
		if(config.commandLine.p){
			port = config.commandLine.p[0];
		}
		
		var interactive = require('./interactive/server.js');
		
		interactive({port, onRequest: function(message){
			
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