var { jsConfigManager, settingsPath, getLocalConfig } = require('../configManager');

function makeid(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!£$'; // must be careful with the special chars to avoid breaking the connection strings
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

function createSiteAdmin(connection, config, success){
	
	if(config.noAdminAccount){
		return success(config);
	}
	
	console.log('Creating a site admin account..');
	
	// Create site admin (password is "admin"):
	var createAdminUser = 'USE `' + config.databaseName + '`;CREATE TABLE `site_user` (`Id` int(11) NOT NULL AUTO_INCREMENT,`FirstName` varchar(40) DEFAULT NULL,`LastName` varchar(40) DEFAULT NULL,`Email` varchar(80) DEFAULT NULL,`Role` int(11) NOT NULL,' + 
	'`JoinedUtc` datetime NOT NULL, `Username` varchar(40) DEFAULT NULL,`PasswordHash` varchar(80) DEFAULT NULL,PRIMARY KEY (`Id`));' +
	'INSERT INTO site_user(`Id`, `PasswordHash`, `Email`, `FirstName`, `LastName`, `Role`, `JoinedUtc`, `Username`) VALUES (1, "$P$68awep7Ri9CjDs7WuPAZyGfjCB1nXZ.", "admin@' + config.domainName + '", "Site", "Admin", 1, NOW(), "admin");';
	
	connection.query(
		  createAdminUser,
		  function(err, results, fields) {
			  if(err){
				  connection.close();
				  console.log(err);
				  console.log('Error occurred whilst trying to setup an admin account for you. Skipping it.');
			  }
			  success(config);
		  }
	);
	
}

/*
* First time db setup. Reads from the appsettings to install the database defined there.
*/
function installDatabase(config){
	
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
	var appsettings = appsettingsManager.get();
	var dbConfig = {};
	
	appsettings.ConnectionStrings.DefaultConnection.split(';').forEach(entry => {
		var eqls = entry.indexOf('=');
		
		if(eqls == -1){
			dbConfig[entry.toLowerCase()] = true;
		}else{
			dbConfig[entry.substring(0, eqls).toLowerCase()] = entry.substring(eqls + 1);
		}
	});
	
	var localConfig = getLocalConfig();
	
	return createDatabase(localConfig.databases.local, {
		databaseName: dbConfig.database,
		databaseUser: dbConfig.user,
		databasePassword: dbConfig.password
	});
}

function createDatabase(connectionInfo, config){
	return new Promise((success, reject) => {
		
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
					
					// Create site admin account:
					createSiteAdmin(connection, config, success);
				}
			  );
		  }
		);
	});
}


module.exports = {
	createDatabase,
	createSiteAdmin,
	installDatabase
};