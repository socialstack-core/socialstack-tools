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
		{name: 'push', alias: 'p'},
		{name: 'contribute'},
		{name: 'buildui'},
		{name: 'buildapi'},
		{name: 'buildapp'},
		{name: 'host'},
		{name: 'deploy'},
		{name: 'install', alias: 'i'},
		{name: 'uninstall', alias: 'u'},
		{name: 'init'},
		{name: 'sync'},
		{name: 'create', alias: 'c'},
		{name: 'configuration'},
		{name: 'configure'},
		{name: 'upgrade'},
		{name: 'migrate', alias: 'm'},
		{name: 'interactive'},
		{name: 'render', alias: 'r'},
		{name: 'repository'},
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
			
			if(!result[lastFlag]){
				result[lastFlag] = [];
			}
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
	'id': true,
	'repository': true
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
			if(!result && config.commandLine.command != 'buildapp'){ // buildapp works both ways.
				console.error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI or an Api directory to be a project.');
				return;
			}
			
			start(config);
		});
	}
	
}

function start(config){
	
	if(config.commandLine.command == 'buildui'){
		
		// -force is used to use socialstack's internal build chain anyway when a custom one was detected.
		if(config.commandLine.force){
			config.force = true;
		}
		
		// -prod
		if(config.commandLine.prod){
			config.minified = true;
		}
		
		// -noCache
		if(config.commandLine.noCache){
			config.noCache = true;
		}
		
		// Only include when about to build to avoid blocking up e.g. generate commands with the huge amount of JS this ultimately includes.
		var { buildUI } = require('./build/helpers.js');
		
		buildUI(config, false).then(() => {
			console.log("Build success");
		}).catch(e => {
			console.log("Build failed");
			console.log(e);
			process.exit(1);
		});
		
	}else if(config.commandLine.command == 'buildapp'){
		
		// Requires:
		// apiUrl - the URL the app will use to talk to the API
		// instanceUrl - the URL of an instance where it can obtain all the localisations etc (typically a stage site).
		
		if(!config.commandLine.apiUrl){
			console.error('-apiUrl is required. It\'s of the form "https://mysite.com/" and will be the API location the built app will use.');
			process.exit(1);
		}
		
		if(!config.commandLine.instanceUrl){
			console.error('-instanceUrl is required. It\'s of the form "https://mysite.com/" and will be the instance that is used to generate all the localised JS files, plus any static media.');
			process.exit(1);
		}
		
		config.apiUrl = config.commandLine.apiUrl[0];
		config.instanceUrl = config.commandLine.instanceUrl[0];
		
		// Only include when about to build to avoid blocking up e.g. generate commands with the huge amount of JS this ultimately includes.
		var { buildApp } = require('./build/app.js');
		
		buildApp(config, false).then(() => {
			console.log("Build success");
		}).catch(e => {
			console.log("Build failed");
			console.log(e);
			process.exit(1);
		});
		
	}else if(config.commandLine.command == 'buildapi'){
		
		// Only include when about to build to avoid blocking up e.g. generate commands with the huge amount of JS this ultimately includes.
		var { buildAPI } = require('./build/helpers.js');
		
		buildAPI(config).catch(e => {
			console.log("Build failed");
			process.exit(1);
		});
		
	}else if(config.commandLine.command == 'build'){
		
		// Builds both API and UI
		if(config.commandLine.prod){
			config.minified = true;
			config.compress = true;
		}
		
		// -force is used to use socialstack's internal build chain anyway when a custom one was detected.
		if(config.commandLine.force){
			config.force = true;
		}
		
		// Only include when about to build to avoid blocking up e.g. generate commands with the huge amount of JS this ultimately includes.
		var { buildAll } = require('./build/helpers.js');
		var { gitSync } = require('./build/git.js');
		var { localDeployment } = require('./build/localDeployment.js');
		var { runTests } = require('./build/tests.js');
		
		var preBuild = [];
		
		if(config.commandLine.branch){
			// Perform some git syncing first:
			preBuild.push(gitSync(config.commandLine.branch[0], config.calledFromPath));
		}
		
		Promise.all(preBuild)
		.then(() => {
			return buildAll({
				prod: config.minified,
				compress: config.compress,
				noUi: config.commandLine.noUI,
				noApi: config.commandLine.noApi,
				noApp: config.commandLine.noApp
			}, config);
		})
		.then(() => {
			// A successful build occurred.
			// Are we configured to perform a local deploy?
			if(config.commandLine.localDeploy){
				// Yes. This flag specifies the base directory being deployed to.
				
				return localDeployment({
					target: config.commandLine.localDeploy[0],
					projectRoot: config.projectRoot,
					appSettingsExtension: config.commandLine.appSettingsExtension ? config.commandLine.appSettingsExtension[0] : null,
					restartService: config.commandLine.restartService ? config.commandLine.restartService[0] : null,
				});
				
			}
		})
		.then(() => {
			
			// Are we configured to perform tests?
			if(config.commandLine.test){
				// Yes. Invoke dotnet test now.
				return runTests({
					projectRoot: config.projectRoot,
					csProject: 'Tests/Tests.csproj'
				});
			}
			
		})
		.catch(e => {
			console.error(e);
			console.log("Build failed");
			process.exit(1);
		});
		
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
		
	}else if(config.commandLine.command == 'upgrade'){
		
		// Deploys a project over SSH.
		require('./upgrade/upgrade.js')(config);
		
	}else if(config.commandLine.command == 'contribute' || config.commandLine.command == 'push'){
		
		// Contributes thirdparty changes
		require('./contribute/contribute.js')(config);
		
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
		
	}else if(config.commandLine.command == 'repository'){
		
		var repository = require('./repository/index.js');
		repository(config);
		
	}else if(config.commandLine.command == 'interactive'){
		// Interactive mode. We'll send and receive data over stdio.
		// The other end is the server, so one host site can have multiple node processes at once.
		
		var serverrender = require('./serverrender/index.js');
		
		if(config.commandLine.p){
			console.error('Obsolete usage of socialstack tools. Upgrade the Api/StackTools module in this project to continue using this version of socialstack tools.');
			return;
		}
		
		if(config.commandLine.parent){
			console.error('[NOTE] Old usage of socialstack tools detected. Upgrade the Api/StackTools module in this project to prevent stray node.js processes being created on forced quits. Proceeding anyway.');
		}
		
		if(config.commandLine.lockfile){
			config.lockfile = config.commandLine.lockfile[0];
		}
		
		var interactive = require('./interactive/index.js');
		
		config.onRequest = function(message){
			
			var action = message.request.action;
			
			if(action == "watch"){
				
				// Only include when about to build to avoid blocking up e.g. generate commands with the huge amount of JS this ultimately includes.
				var { watchOrBuild } = require('./build/helpers.js');
				
				config.minified = message.request.prod || message.request.minified;
				config.compress = message.request.prod || message.request.compress;
				config.bundled = true;
				watchOrBuild(config, true);
				message.response({success: true});
			}else{
				message.response({unknown: action});
			}
			
		};
		
		interactive(config);
		
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

		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack help");
		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack /?");
		console.log(ConsoleReset, "  outputs the help text for SocialStack tools as shown here");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack push", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack contribute", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack p", " *");
		console.log(ConsoleReset, "  Scans your thirdparty module directories for changes you've made and then contributes them to their originating repository.");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack build", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack b", " *");
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

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack install", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack i", " *");
		console.log(ConsoleReset, "  install the named module(s) from any repositories you have configured - for instance:");
		console.log();
		console.log(commandColour, "    socialstack i Api/HelloWorld");
		console.log(ConsoleReset);
		console.log("   You can list multiple modules here to install them all. You can also use package names:");
		console.log();
		console.log(commandColour, "    socialstack i Tags");
		console.log(ConsoleReset);
		console.log("   Refer to https://cloud.socialstack.dev/modules for available modules and packages.");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack uninstall", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack u", " *");
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

		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack create");
		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack c");
		console.log(ConsoleReset, "  creates a new blank SocialStack project in your working directory.");
		console.log("   Optionally provide it a name like this:");
		console.log();
		console.log(commandColour, "    socialstack create example.com");
		console.log(ConsoleReset);
		console.log("   This will also create a database for you too, if you've setup your database config -");
		console.log("   (see https://www.npmjs.com/package/socialstack).");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack configuration");
		console.log(ConsoleReset, "  returns the location of the configuration file for socialstack tools");
		console.log();

/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack configure", " *");
		console.log(ConsoleReset, "  ---");
		console.log();
*/
/*
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack migrate", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack m", " *");
		console.log(ConsoleFgRed, "  ** CURRENTLY UNSUPPORTED **");
		console.log(ConsoleReset, "  In the future this will be used to automatically convert websites to or from");
		console.log("   other frameworks via simple, shared commands");
		console.log();
*/
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

		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack version");
		console.log(escapeSequence(ConsoleBright, commandColour), "socialstack v");
		console.log(ConsoleReset, "  outputs the currently installed version of SocialStack tools");
		console.log();

		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack generate", " *");
		console.log(escapeSequence(ConsoleBright, commandColour, noteColour), "socialstack g", " *");
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