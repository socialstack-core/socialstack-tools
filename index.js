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
var { buildAPI, buildUI, buildAll, watchOrBuild, setBuildCallback } = require('./build/helpers.js');
var { setLocalConfig, localConfigPath } = require('./configManager/index.js');
var { findProjectRoot, isProjectRoot } = require('./projectHelpers/helpers.js');

// console.log() colour support
const ConsoleReset = "\x1b[0m";
const ConsoleBright = "\x1b[1m";
const ConsoleDim = "\x1b[2m";
const ConsoleUnderscore = "\x1b[4m";
const ConsoleBlink = "\x1b[5m";
const ConsoleReverse = "\x1b[7m";
const ConsoleHidden = "\x1b[8m";

const ConsoleFgBlack = "\x1b[30m";
const ConsoleFgRed = "\x1b[31m";
const ConsoleFgGreen = "\x1b[32m";
const ConsoleFgYellow = "\x1b[33m";
const ConsoleFgBlue = "\x1b[34m";
const ConsoleFgMagenta = "\x1b[35m";
const ConsoleFgCyan = "\x1b[36m";
const ConsoleFgWhite = "\x1b[37m";

const ConsoleBgBlack = "\x1b[40m";
const ConsoleBgRed = "\x1b[41m";
const ConsoleBgGreen = "\x1b[42m";
const ConsoleBgYellow = "\x1b[43m";
const ConsoleBgBlue = "\x1b[44m";
const ConsoleBgMagenta = "\x1b[45m";
const ConsoleBgCyan = "\x1b[46m";
const ConsoleBgWhite = "\x1b[47m";



function escapeSequence(...args) {
	var escapeSequence = "";
	
	for (var i = 0; i < args.length; i++) {
		
		switch (args[i]) {
			// modifier
			case ConsoleReset:
			case ConsoleBright:
			case ConsoleDim:
			case ConsoleUnderscore:
			case ConsoleBlink:
			case ConsoleReverse:
			case ConsoleHidden:
				escapeSequence += args[i];
				break;
				
			// colour
			default:
				escapeSequence += args[i] + "%s";
				break;
			
		}
		
	}
	
	return escapeSequence;	
}

// Used for rendering React by command.
// This is referenced out here such that any JS rebuilds can simply clear this variable.
var renderers = null;
setBuildCallback(() => {
	renderers = null;
})

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
		{name: 'help', alias: '/?'},
		{name: 'watch', alias: 'w'},
		{name: 'build', alias: 'b'},
		{name: 'buildui'},
		{name: 'buildapi'},
		{name: 'host'},
		{name: 'deploy'},
		{name: 'install', alias: 'i'},
		{name: 'uninstall', alias: 'u'},
		{name: 'init'},
		{name: 'sync'},
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

var commandsThatWorkWithoutBeingInAProject = {
	'help': true,
	'create': true,
	'version': true,
	'configuration': true,
	'host': true,
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
		
		buildAll({
			noUi: config.commandLine.noUI,
			noApi: config.commandLine.noApi,
			noApp: config.commandLine.noApp
		}, config);
		
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
		
	}else if(config.commandLine.command == 'sync'){
		
		// Generate a module.
		var sync = require('./sync/sync.js');
		sync(config);
		
	}else if(config.commandLine.command == 'where'){
		
		// Just outputs the project directory.
		console.log(config.projectRoot);
		
	}else if(config.commandLine.command == 'render'){
		// Renders UI's (this typically actually happens over the interactive mode below).
		
		var serverrender = require('./serverrender/index.js');
		
		var rdr = serverrender.getRenderer(config, "UI");
		
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
		
		rdr.render({canvas, context}).then(result => {
			console.log(result);
		});
		
	}else if(config.commandLine.command == 'version'){
		
		// Output the version and quit.
		var info = require('./package.json');
		console.log(info.version);
		
	}else if(config.commandLine.command == 'host'){
		
		// Host config. This is used to define target servers for simple deploys (over SSH).
		require('./host/index.js')(config);
		
	}else if(config.commandLine.command == 'deploy'){
		
		// Deploys a project over SSH.
		require('./deploy/deploy.js')(config);
		
	}else if(config.commandLine.command == 'configuration'){
		
		console.log(localConfigPath());
		
	}else if(config.commandLine.command == 'configure'){
		
		var username = config.commandLine.u ? config.commandLine.u[0] : 'root';
		var password = config.commandLine.p ? config.commandLine.p[0] : undefined;
		var server = config.commandLine.s ? config.commandLine.s[0] : 'localhost';
		
		setLocalConfig({
			databases: {
				local: {
					username,
					password,
					server
				}
			}
		}).then(() => {
			console.log('Socialstack tools configured');
		})
		
	}else if(config.commandLine.command == 'init'){
		
		// Pulled a socialstack project - this e.g. sets up its database
		require('./init/index.js')(config);
		
	}else if(config.commandLine.command == 'create'){
		
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
				var modules = message.request.modules || 'Admin';
				
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
				if(renderers == null){
					renderers = {};
				}
				
				var renderer = renderers[modules];
				
				if(!renderer){
					// Note: Renderer is in the 'global' scope such that a js file rebuild forces a new renderer instance.
					renderer = serverrender.getRenderer(config, modules);
					renderers[modules] = renderer;
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
		
	}else if(config.commandLine.command == 'help'){
		var info = require('./package.json');
		var title = " SocialStack Tools v" + info.version;
		//var commandColour = ConsoleFgWhite;
		//var noteColour = ConsoleFgYellow;
		var commandColour = ConsoleFgYellow;
		var noteColour = ConsoleFgRed;
		
		console.log();
		console.log(escapeSequence(ConsoleBright, ConsoleFgWhite), title);
		console.log(ConsoleReset, "-".repeat(title.length-1));
		console.log();
		
		console.log("The following commands are available:");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour), "socialstack help", " / ", "socialstack /?");
		console.log(ConsoleReset, "  outputs the help text for SocialStack tools as shown here");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack watch", " / ", "socialstack w", " *");
		console.log(ConsoleReset, "  starts a watcher which checks for changes in your UI/Source and Admin/Source directories.");
		console.log("   When a change happens, your UI will be rebuilt. This process doesn't exit.");		
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack build", " / ", "socialstack b", " *");
		console.log(ConsoleReset, "  builds the UI, API and optionally native apps with Cordova.");
		console.log("   Use the optional -prod command to minify and pre-gzip the UI builds for you:");
		console.log();
		console.log(commandColour, "    socialstack build -prod");
		console.log(ConsoleReset);
		console.log("   It's recommended for pipelines to use this build command.");		
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack buildui", " *");
		console.log(ConsoleReset, "  builds UI/Source and Admin/Source, then quits.");
		console.log("   If you'd like to make a production (minified and pre-gzipped) build, add the -prod flag:");
		console.log();
		console.log(commandColour, "    socialstack buildui -prod");
		console.log(ConsoleReset);

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack buildapi", " *");
		console.log(ConsoleReset, "  a convenience build command (defaults to outputting into Api/Build).");
		console.log("   Note that the API is separate from the UI, so there is no order requirement - ");
		console.log("   you can build the API and UI in whatever order you want, or build everything as seen above.");		
		console.log();

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack host", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack deploy", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack install", " / ", "socialstack i", " *");
		console.log(ConsoleReset, "  install the named module(s) from any repositories you have configured, as a submodule - for instance:");
		console.log();
		console.log(commandColour, "    socialstack i Api/HelloWorld");
		console.log(ConsoleReset);
		console.log("   You can list multiple modules here to install them all. You can also use package names:");
		console.log();
		console.log(commandColour, "    socialstack i Tags");
		console.log(ConsoleReset);
		console.log("   Refer to https://source.socialstack.dev/modules for available modules.");
		console.log("   Refer to https://source.socialstack.dev/packages for available packages.");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack uninstall", " / ", "socialstack u", " *");
		console.log(ConsoleReset, "  remove the named module(s) (or packages).");
		console.log("   Like the install command, you can list multiple modules - for instance:");
		console.log();
		console.log(commandColour, "    socialstack u Api/HelloWorld");
		console.log(ConsoleReset);

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack init", " *");
		console.log(ConsoleReset, "  creates a database for the current project");
		console.log();

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack sync", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack create", " / ", "socialstack c", " *");
		console.log(ConsoleReset, "  creates a new blank SocialStack project in your working directory.");
		console.log("   Optionally provide it a domain name like this:");
		console.log();
		console.log(commandColour, "    socialstack create example.com");
		console.log(ConsoleReset);
		console.log("   This will also create a database for you too, if you've setup your database config -");
		console.log("   (see https://www.npmjs.com/package/socialstack).");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack configuration", " *");
		console.log(ConsoleReset, "  returns the location of the configuration file for the current project");
		console.log();

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack configure", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack migrate", " / ", "socialstack m", " *");
		console.log(ConsoleFgRed, "  ** CURRENTLY UNSUPPORTED **");
		console.log(ConsoleReset, "  In the future this will be used to automatically convert websites to or from");
		console.log("   other frameworks via simple, shared commands");
		console.log();

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack interactive", " *");
		console.log(ConsoleReset, "  ---");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack render", " / ", "socialstack r", " *");
		console.log(ConsoleReset, "  ---");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack add", " / ", "socialstack a", " *");
		console.log(ConsoleReset, "  ---");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack share", " / ", "socialstack s", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack version", " / ", "socialstack v", " *");
		console.log(ConsoleReset, "  outputs the currently installed version of SocialStack tools");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, ConsoleFgWhite, commandColour, noteColour), "socialstack generate", " / ", "socialstack g", " *");
		console.log(ConsoleReset, "  creates a new module.  For instance, to create a HelloWorld module under UI, use:");
		console.log();
		console.log(commandColour, "    socialstack g UI/HelloWorld");
		console.log(ConsoleReset);
		console.log("   This will automatically create a barebones class and stylesheet for the new module");
		console.log();

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack where", " *");
		console.log(ConsoleReset, "  ---");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack id", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/

		console.log();
		console.log(escapeSequence(ConsoleBright, noteColour, ConsoleReset, noteColour), "*", " only available within the context of a project");

		console.log(ConsoleReset);
	}
	
}