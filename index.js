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
		{name: 'install', alias: 'i'},
		{name: 'init'},
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
				throw new Error('Not a socialstack project: ' + config.calledFromPath + '\nProjects must contain a UI and an Api directory.');
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
	
	// Find the project root next.
	findProjectRoot(config, start);
	
}

function start(config){
	
	var isWatch = config.commandLine.command == 'watch';
	
	if(isWatch || config.commandLine.command == 'buildui'){
		
		// Site UI:
		var sourceDir = config.projectRoot + '/UI/Source';
		var outputDir = config.projectRoot + '/UI/public/pack/';
		var moduleName = 'UI';
		
		var builder = require('./buildwatch/index.js');
		
		var uiPromise = builder[isWatch ? 'watch' : 'build']({
			sourceDir,
			moduleName,
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
				outputStaticPath: outputDir + 'modules/',
				outputCssPath: outputDir + 'styles.css',
				outputJsPath: outputDir + 'main.generated.js'
			});
			
		});
		
	}else if(config.commandLine.command == 'render'){
		// Renders UI's serverside.
		
		var serverrender = require('./serverrender/index.js');
		
		var renderer= serverrender.getRenderer(config);
		
		var home = renderer.render('/');
		
		console.log(home);
		
	}
	
}