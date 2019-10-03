var getAppDataPath = require('appdata-path');
var fs = require('fs');
var https = require('https');
var path = require('path');
var unzip = require('unzip');
var process = require('process');

var adp = getAppDataPath('socialstack');
var settingsPath = adp + '/settings.json';

/*
* Reads the global socialstack config info (sequentially)
*/
function getLocalConfig(){
	return new jsConfigManager(settingsPath).get();
}

function jsConfigManager(filepath){
	this.get = function(){
		try{
			var file = fs.readFileSync(filepath, {encoding: 'utf8'});
			
			// Strip BOM:
			file = file.replace(/^\uFEFF/, '');
		}catch(e){
			// Doesn't exist
			return {};
		}
		
		var result;
		
		try{
			result = JSON.parse(file);
		}catch(e){
			console.error('A JSON settings file failed to parse. It\'s at ' + filepath + '. Try opening the file and validating it in a JSON validator. Here\'s the full error: ');
			throw e;
		}
		
		return result;
	};
	
	this.update = function(newCfg){
		fs.writeFileSync(filepath,JSON.stringify(newCfg, null, 4), {encoding: 'utf8'});
	};
}


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

function askFor(text, configName, cb){
	return new Promise((success, reject) => {
		
		if(newConfiguration[configName]){
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

// The repo is https only, because it's (at least) 2019.
var repoHost = localConfig.repository || 'https://modules.socialstack.cf';

function installModule(moduleName){
	return new Promise((success, reject) => {
		
		var moduleFilePath = (moduleName == 'project') ? '' : moduleName.replace('.', '/');
		
		// Make the dir:
		if(moduleFilePath != ''){
			// Recursive mkdir (catch if it exists):
			try{
				mkDirByPathSync(config.calledFromPath + '/' + moduleFilePath);
			}catch(e){
				console.log(e);
				// console.log(moduleName + ' is already installed. You\'ll need to delete it if the goal was to overwrite it.');
				return success();
			}
			moduleFilePath = config.calledFromPath + '/' + moduleFilePath + '/';
		}else{
			moduleFilePath = config.calledFromPath + '/';
		}
		
		// Unzips whilst it downloads. There's no temporary file use here.
		var fromUrl = repoHost + '/content/latest/' + moduleName.replace('.', '/') + '.zip';
		
		https.get(fromUrl, function(response) {
		    response.pipe(unzip.Parse()).on('entry', function (entry) {
				
				var pathParts = entry.path.split('/');
				pathParts.shift();
				var filePath = pathParts.join('/');
				
				if(entry.type == 'File'){
					mkDirByPathSync(moduleFilePath + path.dirname(filePath));
					entry.pipe(fs.createWriteStream(moduleFilePath + filePath));
				}else{
					mkDirByPathSync(moduleFilePath + filePath);
					entry.autodrain()
				}
				
			}).on('close', function() {
				success();
			});
		});
	});
}

function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const sep = path.sep;
  targetDir = targetDir.replace('/', sep).replace('\\', sep);
  const initDir = path.isAbsolute(targetDir) ? sep : '';
  const baseDir = isRelativeToScript ? __dirname : '.';
  return targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir);
    try {
      fs.mkdirSync(curDir);
    } catch (err) {
      if (err.code === 'EEXIST') { // curDir already exists!
        return curDir;
      }

      // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
      if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
        throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
      }

      const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
      if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
        throw err; // Throw if it's just the last created dir.
      }
    }

    return curDir;
  }, initDir);
}

function makeid(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!£$'; // must be careful with the special chars to avoid breaking the connection strings
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

function createDatabase(connectionInfo, config){
	return new Promise((success, reject) => {
		console.log('Setting up database');
		
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
		  'CREATE SCHEMA `' + config.databaseName + '`',
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
			  
			  config.databaseUser = config.databaseUser || config.databaseName + '_u';
			  config.databasePassword = config.databasePassword || makeid(10);
			  
			  connection.query(
				'CREATE USER \'' + config.databaseUser.replace('\'', '\\\'') + '\'@\'localhost\' IDENTIFIED BY \'' + config.databasePassword.replace('\'', '\\\'') + '\';' + 
				'GRANT ALL PRIVILEGES ON `' + config.databaseName + '`.* TO \'' + config.databaseUser.replace('\'', '\\\'') + '\'@\'localhost\'',
				function(err, results, fields) {
					connection.close();
					
					if(err){
						if(err.code){
							if(err.code == 'ER_SPECIFIC_ACCESS_DENIED_ERROR'){
								console.log('Unable to create the user account because the database user you\'re using likely doesn\'t have the GRANT permission.');
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

askFor('What\'s the public URL of your live website? Include the http or https, such as https://socialstack.cf', 'url').then(
	config => {
		
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
		// Download the base project for this module set (in parallel)
		console.log('Setting up the main project files.');
		
		return installModule('project').then(() => {
			// At this point change the guids and apply any new DB config:
			
			if(cfg.databaseUser && cfg.databasePassword){
				// Otherwise the DB already existed and we didn't create the user acc.
				var appsettingsManager = new jsConfigManager(config.calledFromPath + "/appsettings.json");
				var appsettings = appsettingsManager.get();
				appsettings.ConnectionStrings.DefaultConnection = "server=localhost;port=3306;SslMode=none;database=" + cfg.databaseName + ";user=" + cfg.databaseUser + ";password=" + cfg.databasePassword;
				appsettingsManager.update(appsettings);
			}
			
			console.log('Starting to download modules.');
			
			var moduleNames = cfg.modules.split(',');
			
			var modules = [
				'Api.AutoForms', 'Api.AvailableEndpoints', 
				'Api.Configuration', 'Api.Contexts', 'Api.CanvasRenderer', 'Api.Database', 'Api.DatabaseDiff', 'Api.Emails',
				'Api.Eventing', 'Api.Pages', 'Api.Permissions','Api.PasswordReset','Api.PasswordAuth', 'Api.NavMenus', 'Api.NavMenuItems', 'Api.Results',
				'Api.Signatures', 'Api.Startup', 'Api.StackTools', 'Api.Translate', 'Api.Uploads', 'Api.Users'
			];
			
			for(var i=0;i<moduleNames.length;i++){
				
				var name = moduleNames[i].trim();
				
				if(name != ''){
					modules.push(name);
				}
			}
			
			var pendingDownloads = [];
			
			for(var i=0;i<modules.length;i++){
				pendingDownloads.push(installModule(modules[i]));
			}
			
			return Promise.all(pendingDownloads);
		});
		
	}
).then(
	() => console.log('Complete. You can now run the project with "dotnet run" or start it with your favourite IDE.')
)

	


};