var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzipper');
var process = require('process');
var { jsConfigManager, getLocalConfig, settingsPath } = require('../configManager');
var { installModules } = require('../install/helpers.js');
var { createDatabase, tidyUrl } = require('./helpers.js');
var exec = require('child_process').exec;

module.exports = (config) => {

console.log(' ');
console.log('  ____     U  ___ u   ____                _       _      ____     _____      _        ____   _  __    ');
console.log(' / __"| u   \\/"_ \\/U /"___|    ___    U  /"\\  u  |"|    / __"| u |_ " _| U  /"\\  u U /"___| |"|/ /    ');
console.log('<\\___ \\/    | | | |\\| | u     |_"_|    \\/ _ \\/ U | | u <\\___ \\/    | |    \\/ _ \\/  \\| | u   | \' /     ');
console.log(' u___) |.-,_| |_| | | |/__     | |     / ___ \\  \\| |/__ u___) |   /| |\\   / ___ \\   | |/__U/| . \\\\u   ');
console.log(' |____/>>\\_)-\\___/   \\____|  U/| |\\u  /_/   \\_\\  |_____||____/>> u |_|U  /_/   \\_\\   \\____| |_|\\_\\    ');
console.log('  )(  (__)    \\\\    _// \\\\.-,_|___|_,-.\\\\    >>  //  \\\\  )(  (__)_// \\\\_  \\\\    >>  _// \\\\,-,>> \\\\,-. ');
console.log(' (__)        (__)  (__)(__)\\_)-\' \'-(_/(__)  (__)(_")("_)(__)    (__) (__)(__)  (__)(__)(__)\\.)   (_/  ');
console.log(' ');

console.log('Welcome to Socialstack! We\'ll now setup a new project in your current working directory.');
var readline = require('readline');
var newConfiguration = {};

if(config.commandLine['-']){
	// E.g. socialstack create site.com
	newConfiguration['url'] = config.commandLine['-'][0];
}

if(config.commandLine.modules){
	// E.g. socialstack create site.com
	newConfiguration['modules'] = config.commandLine.modules.join(',');
}

if(config.commandLine.dbMode){
	newConfiguration.dbMode = config.commandLine.dbMode[0];
}

if(config.commandLine.container){
	newConfiguration.container = true;
}

function askFor(text, configName, cb){
	return new Promise((success, reject) => {
		
		if(newConfiguration[configName] != undefined){
			// Already set - skip.
			return success(newConfiguration, configName, newConfiguration[configName]);
		}
		
		console.log(text);
		
		var rl = readline.createInterface(process.stdin, process.stdout);
		rl.setPrompt(configName + ': ');
		rl.prompt();
		rl.on('line', function(line) {
			newConfiguration[configName] = line;
			rl.close();
			success(newConfiguration, configName, line);
		});	
	});
}

var localConfig = getLocalConfig();

if(newConfiguration.dbMode == 'dbOnly'){
	tidyUrl(newConfiguration);
	
	createDatabase(localConfig.databases.local, newConfiguration).then(() => {
		console.log('Database setup');
	});
	return;
}else if(newConfiguration.dbMode == 'continue'){
	// Complete a postponed DB create (if there is one to complete).
	var appsettingsManager = new jsConfigManager(config.calledFromPath + "/appsettings.json");
	var appsettings = appsettingsManager.get();
	
	if(!appsettings.PostponedDatabase){
		return;
	}
	
	delete appsettings.PostponedDatabase;
	newConfiguration.url = appsettings.PublicUrl;
	tidyUrl(newConfiguration);
	
	createDatabase(localConfig.databases.local, newConfiguration).then(() => {
		console.log('Database setup');
		var cfg = newConfiguration;
		
		if(cfg.databaseUser && cfg.databasePassword){
			appsettings.ConnectionStrings.DefaultConnection = "server=localhost;port=3306;SslMode=none;AllowPublicKeyRetrieval=true;database=" + cfg.databaseName + ";user=" + cfg.databaseUser + ";password=" + cfg.databasePassword;
		}
		
		appsettingsManager.update(appsettings);
		
	});
	return;
}

askFor('What\'s the public URL of your live website? Include the http or https, such as https://socialstack.cf', 'url').then(
	config => {
		
		// Set the root:
		tidyUrl(config);
		
		if(localConfig && localConfig.databases && localConfig.databases.local){
			
			// No database needed:
			if(config.dbMode == 'none' || config.dbMode == 'postpone'){
				return true;
			}
			
			// Go!
			return createDatabase(localConfig.databases.local, config);
		}else{
			return askFor('Looks like this is the first time. We can optionally also create the database for you if you provide a local MySQL user account with create permissions. Would you like to do this? [Y/n]');
		}
	}
).then(
	config => askFor('(Optional) Which modules would you like to install now? Separate multiple modules with , or press enter to skip', 'modules')
).then(
	cfg => {
		console.log('Attempting to create a git repository via "git init"..');
		
		config.projectRoot = config.calledFromPath;
		
		return new Promise((s, r)=>{
			exec('git init', {
				cwd: config.calledFromPath
			}, function(err, stdout, stderr){
				
				if(err){
					console.log(err);
				}else{
					if(stdout){
						console.log(stdout);
					}
					if(stderr){
						console.log(stderr);
					}
				}
				
				s(cfg);
			});
		});
	}
).then(
	cfg => {
		// Download the base project for this module set (in parallel)
		console.log('Setting up the main project files.');
		
		return installModules(['project'], config).then(() => {
			// At this point change the guids and apply any new DB config:
			
			// Wait a little to make sure the file is available:
			setTimeout(function(){
				var appsettingsManager = new jsConfigManager(config.calledFromPath + "/appsettings.json");
				var appsettings = appsettingsManager.get();
				appsettings.PublicUrl = cfg.url;
				if(cfg.container){
					appsettings.Container = 1;
				}
				
				if(cfg.dbMode == 'postpone'){
					appsettings.PostponedDatabase = true;
				}else if(cfg.databaseUser && cfg.databasePassword){
					appsettings.ConnectionStrings.DefaultConnection = "server=localhost;port=3306;SslMode=none;AllowPublicKeyRetrieval=true;database=" + cfg.databaseName + ";user=" + cfg.databaseUser + ";password=" + cfg.databasePassword;
				}
				
				appsettingsManager.update(appsettings);
			}, 1000);
			
			console.log('Starting to download modules.');
			
			var moduleNames = (!cfg.modules || cfg.modules == 'none') ? [] : cfg.modules.split(',');
			
			var modules = [
				// Defaults package (https://source.socialstack.cf/packages/defaults/)
				'defaults'
			];
			
			for(var i=0;i<moduleNames.length;i++){
				
				var name = moduleNames[i].trim();
				
				if(name != ''){
					modules.push(name);
				}
			}
			
			return installModules(modules, config);
		});
		
	}
).then(
	() => console.log('Complete. You can now run the project with "dotnet run" or start it with your favourite IDE.')
)

	


};