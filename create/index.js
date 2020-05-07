var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzipper');
var process = require('process');
var { jsConfigManager, getLocalConfig, settingsPath } = require('../configManager');
var { installModule } = require('../install/helpers.js');
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

function makeid(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!£$'; // must be careful with the special chars to avoid breaking the connection strings
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

function tidyUrl(config){
	
	config.url = config.url.trim();
	var domainName = config.url;
	var parts = domainName.split('//');
	if(parts.length == 1){
		// Assume https:
		config.url = 'https://' + domainName;
	}else{
		domainName = parts[1];
	}
	
	domainName = domainName.replace('/', '');
	
	// DB name is just the site url:
	config.databaseName = domainName;
	
}

function createDatabase(connectionInfo, config){
	return new Promise((success, reject) => {
		
		if(config.dbMode == 'none'){
			success(config);
			return;
		}
		
		if(config.dbMode == 'postpone'){
			success(config);
			return;
		}
		
		console.log('Setting up database');
		
		config.databaseUser = config.databaseUser || config.databaseName + '_u';
		config.databasePassword = config.databasePassword || makeid(10);
		
		var createSchema = 'CREATE SCHEMA `' + config.databaseName + '`';
		var createUser = 'CREATE USER \'' + config.databaseUser.replace('\'', '\\\'') + '\'@\'localhost\' IDENTIFIED BY \'' + config.databasePassword.replace('\'', '\\\'') + '\';' + 
				'GRANT ALL PRIVILEGES ON `' + config.databaseName + '`.* TO \'' + config.databaseUser.replace('\'', '\\\'') + '\'@\'localhost\'';
		
		if(config.dbMode == 'offline'){
			// Outputs to a file:
			var tempPath = 'create-database.sql';
			
			fs.writeFile(tempPath, createSchema + ';' + createUser, () => {
				success(config);
			});
			return;
		}
		
		var mysql = require('mysql2');
		var host = connectionInfo.server || 'localhost';
		const connection = mysql.createConnection({
		  host,
		  user: connectionInfo.username,
		  password: connectionInfo.password,
		  multipleStatements: true
		});
		
		// Run the create command - it'll fail if it already exists anyway:
		connection.query(
		  createSchema,
		  function(err, results, fields) {
			  if(err){
				  connection.close();
				  
				  // Already exists, or failed to connect - won't attempt to edit it, or create a user.
				  if(err.code){
					  if(err.code == 'ER_ACCESS_DENIED_ERROR'){
						  console.log('Access denied to database - we could connect to the server, but it rejected your user/password.');
					  }else if(err.code == 'ETIMEDOUT'){
						  console.log('Unable to connect to database. Check if your MySQL service is running if you\'re sure the config is correct.');
					  }else if(err.code == 'ENOTFOUND'){
						  console.log('Database DNS address "' + host + '" wasn\'t found. Check the server field of your database config.');
					  }else if(err.code == 'ER_DB_CREATE_EXISTS'){
						console.log('Database "' + config.databaseName + '" already exists, so we\'re skipping setting it up entirely. You\'ll need to edit your appsettings to use a suitable user account.');
						return success(config);
					  }else{
						console.log(err.code);
						console.log('Error occurred whilst trying to setup your database.');
					  }
				  }else{
					  console.log('Error occurred whilst trying to setup your database.');
				  }
				  
				  console.log('Your database settings are in this file: ' + settingsPath);
				  console.log('Here\'s the full original error:');
				  throw err;
			  }
			  
			  console.log('Database "' + config.databaseName + '" created. Now generating a user account to use too.');
			  
			  connection.query(
				createUser,
				function(err, results, fields) {
					connection.close();
					
					if(err){
						if(err.code){
							if(err.code == 'ER_CANNOT_USER'){
								console.log('Tried to create a database user account already exists ("' + config.databaseUser + '"). Try either deleting it and also the generated database ("' + config.databaseName + '"), or run this again and manually configure the database connection settings.');
							}else if(err.code == 'ER_SPECIFIC_ACCESS_DENIED_ERROR' || err.code == 'ER_DBACESS_DENIED_ERROR'){
								console.log('Unable to create the user account because the database user you\'re using likely doesn\'t have the GRANT permission. I created a database called "' + config.databaseName + '" and a user account though, so you should delete them both and try again after checking the grant permissions of your tools account.');
							}else{
								console.log(err.code);
								console.log('Error while trying to create a database user.');
							}
						}else{
							console.log('Error while trying to create a database user.');
						}
						
						console.log('Your database settings are in this file: ' + settingsPath);
						console.log('Here\'s the full original error:');
						throw err;
					}
					
					success(config);
				}
			  );
		  }
		);
	});
}

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
	newConfiguration.url = appsettings.BaseUrl;
	tidyUrl(newConfiguration);
	
	createDatabase(localConfig.databases.local, newConfiguration).then(() => {
		console.log('Database setup');
		var cfg = newConfiguration;
		
		if(cfg.databaseUser && cfg.databasePassword){
			appsettings.ConnectionStrings.DefaultConnection = "server=localhost;port=3306;SslMode=none;database=" + cfg.databaseName + ";user=" + cfg.databaseUser + ";password=" + cfg.databasePassword;
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
			// Go!
			return createDatabase(localConfig.databases.local, config);
		}else{
			return askFor('Looks like this is the first time. We can optionally also create the database for you if you provide a local MySQL user account with create permissions. Would you like to do this? [Y/n]');
		}
	}
).then(
	config => askFor('(Optional) Which modules would you like to install now? Browse your preferred repo to find modules you can use. A module can also be a set of modules so you can install a common group if you\'d like. Separate multiple modules with ,', 'modules')
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
		
		return installModule('project', config).then(() => {
			// At this point change the guids and apply any new DB config:
			
			var appsettingsManager = new jsConfigManager(config.calledFromPath + "/appsettings.json");
			var appsettings = appsettingsManager.get();
			appsettings.BaseUrl = cfg.url;
			if(cfg.container){
				appsettings.Container = 1;
			}
			
			if(cfg.dbMode == 'postpone'){
				appsettings.PostponedDatabase = true;
			}else if(cfg.databaseUser && cfg.databasePassword){
				appsettings.ConnectionStrings.DefaultConnection = "server=localhost;port=3306;SslMode=none;database=" + cfg.databaseName + ";user=" + cfg.databaseUser + ";password=" + cfg.databasePassword;
			}
			
			appsettingsManager.update(appsettings);
			
			console.log('Starting to download modules.');
			
			var moduleNames = (!cfg.modules || cfg.modules == 'none') ? [] : cfg.modules.split(',');
			
			var modules = [
				'Api.AutoForms',
				'Api.AvailableEndpoints', 
				'Api.Configuration',
				'Api.Contexts',
				'Api.CanvasRenderer',
				'Api.Database',
				'Api.DatabaseDiff',
				'Api.Emails',
				'Api.Eventing',
				'Api.Pages',
				'Api.Permissions',
				'Api.PasswordReset',
				'Api.PasswordAuth',
				'Api.NavMenus', 
				'Api.Results',
				'Api.Signatures', 
				'Api.StackTools', 
				'Api.Startup', 
				'Api.Translate', 
				'Api.Templates', 
				'Api.Uploader', 
				'Api.Users',
				'Api.ErrorLogging',
				
				'UI.Alert',
				'UI.Bootstrap',
				'UI.Canvas', 
				'UI.CanvasEditor', 
				'UI.Column',
				'UI.Container',
				'UI.Failed',
				'UI.FileSelector',
				'UI.Fonts.FontAwesome',
				'UI.Form', 
				'UI.Functions.ApiEndpoint',
				'UI.Functions.CanvasExpand',
				'UI.Functions.ContentChange',
				'UI.Functions.FormatTime',
				'UI.Functions.GetContentTypeId',
				'UI.Functions.GetContentTypes',
				'UI.Functions.GetDateRange',
				'UI.Functions.GetEndpointType',
				'UI.Functions.GetModule',
				'UI.Functions.GetRef',
				'UI.Functions.HasCapability',
				'UI.Functions.IsNumeric',
				'UI.Functions.MapUrl',
				'UI.Functions.Omit',
				'UI.Functions.QueryString',
				'UI.Functions.Store',
				'UI.Functions.SubmitForm',
				'UI.Functions.Url',
				'UI.Functions.Validation.Required',
				'UI.Functions.Validation.EmailAddress',
				'UI.Functions.WebSocket',
				'UI.Functions.WebRequest',
				'UI.Fonts.OpenSans',
				'UI.Footer',
				'UI.Header',
				'UI.Heading',
				'UI.Html', 
				'UI.Image', 
				'UI.Input', 
				'UI.Loading', 
				'UI.Loop', 
				'UI.Modal', 
				'UI.NavMenu', 
				'UI.PagedLoop', 
				'UI.PageRouter', 
				'UI.GlobalStyle', 
				'UI.HasCapability',
				'UI.Row',
				'UI.Spacer',
				'UI.Start',			
				'UI.Substitute',			
				'UI.Text', 
				'UI.Template', 
				'UI.Uploader',
				
				'Admin.AutoForm',
				'Admin.AutoList',
				'Admin.LoginForm',
				'Admin.MainMenu',
				'Admin.Page.Select',
				'Admin.Pages.AutoEdit',
				'Admin.Pages.Default',
				'Admin.Pages.Landing',
				'Admin.Pages.List',
				'Admin.PermissionGrid',
				'Admin.RegisterForm',
				'Admin.Start',
				'Admin.Functions.GetPages',
				'Admin.Functions.GetAutoForm',
				'Admin.Tile'
			];
			
			for(var i=0;i<moduleNames.length;i++){
				
				var name = moduleNames[i].trim();
				
				if(name != ''){
					modules.push(name);
				}
			}
			
			var asSubModule = true;
			var useHttps = true;
			
			if(config.commandLine.r || config.commandLine.repo){
				// Install as a submodule or a straight checkout if we're not in a git repo already.
				asSubModule = true;
			}else if(config.commandLine.files){
				asSubModule = false;
			}
			
			if(config.commandLine.https){
				// Install as a submodule or a straight checkout if we're not in a git repo already.
				useHttps = true;
			}else if(config.commandLine.ssh){
				useHttps = false;
			}
			
			var pendingInstall = installModule(modules[0], config, asSubModule, useHttps);
			
			for(var i=1;i<modules.length;i++){
				(function(index){
					var module = modules[index];
					pendingInstall = pendingInstall.then(() => {
						console.log("Installing module " + (index+1) + "/" + modules.length);
						return installModule(module, config, asSubModule, useHttps);
					});
				})(i);
			}
			
			return pendingInstall;
		});
		
	}
).then(
	() => console.log('Complete. You can now run the project with "dotnet run" or start it with your favourite IDE.')
)

	


};