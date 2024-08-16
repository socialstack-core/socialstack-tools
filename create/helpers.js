var { jsConfigManager, settingsPath, getLocalConfig } = require('../configManager');

function tidyUrl(config){
	
	if(!config.url){
		config.url = config.databaseName;
	}
	
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
	
	// Track the domain name:
	config.domainName = domainName;
	
	// DB name is just the site url:
	config.databaseName = domainName;
	
}

function makeid(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$'; // must be careful with the special chars to avoid breaking the connection strings
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
	
	if(config.ContentSync || (config.localConfig && config.localConfig.ContentSync)){
		console.log('ContentSync is enabled in this project, so no admin account will be created.');
		connection.close();
		success(config);
		return;
	}
	
	if(!config.domainName){
		tidyUrl(config);
	}
	
	console.log('Creating a site admin account..');
	
	var adminUser = {
		Id: 1, 
		PasswordHash: "$P$68awep7Ri9CjDs7WuPAZyGfjCB1nXZ.",
		Email: 'admin@' + config.domainName,
		FirstName: "Site",
		LastName: "Admin",
		Role: 1,
		CreatedUtc: new Date(),
		EditedUtc: new Date(),
		Username: "admin"
	};
	
	if(connection.type == 'mongodb'){
		// Create site admin (password is "admin"):
		adminUser._id = adminUser.Id;
		delete adminUser.Id;
		
		connection.db.collection("site_user").insertOne(adminUser, (err, result) => {
			if (err) {
			  console.log(err);
			  console.log('Error occurred whilst trying to setup an admin account for you. Skipping it.');
			}
			connection.close();
			success(config);
		});
	}else{
		// Create site admin (password is "admin"):
		var createAdminUser = 'USE `' + config.databaseName + '`;CREATE TABLE `site_user` (`Id` int(11) NOT NULL AUTO_INCREMENT,`FirstName` varchar(40) DEFAULT NULL,`LastName` varchar(40) DEFAULT NULL,`Email` varchar(80) DEFAULT NULL,`Role` int(11) NOT NULL,' + 
		'`CreatedUtc` datetime NOT NULL, `EditedUtc` datetime NOT NULL, `Username` varchar(40) DEFAULT NULL,`PasswordHash` varchar(80) DEFAULT NULL,PRIMARY KEY (`Id`));' +
		'INSERT INTO site_user(`Id`, `PasswordHash`, `Email`, `FirstName`, `LastName`, `Role`, `CreatedUtc`, `EditedUtc`, `Username`) VALUES (1, "$P$68awep7Ri9CjDs7WuPAZyGfjCB1nXZ.", "admin@' + config.domainName + '", "Site", "Admin", 1, NOW(), NOW(), "admin");';
		
		connection.query(
			  createAdminUser,
			  function(err, results, fields) {
				  if(err){
					  console.log(err);
					  console.log('Error occurred whilst trying to setup an admin account for you. Skipping it.');
				  }
				  connection.close();
				  success(config);
			  }
		);
	}
}

/*
* Generates the sql to create a user/ db.
*/
function generateInstallCommand(config){
	var dbConfig = loadConnectionString(config);
	return dbSql(dbConfig.database, dbConfig.user, dbConfig.password).join(';\r\n');
}

function loadConnectionString(config){
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
	
	return dbConfig;
}

/*
* First time db setup. Reads from the appsettings to install the database defined there.
*/
function installDatabase(config){
	var dbConfig = loadConnectionString(config);
	var localConfig = getLocalConfig();
	
	if(localConfig == null || localConfig.databases == null || localConfig.databases.local == null){
		return Promise.reject("Unable to create the database as socialstack tools hasn't been configured with a database instance. You'll need to follow the configuration part of the socialstack tools install guide for this command to work. https://source.socialstack.dev/documentation/guide/blob/master/DeveloperGuide/Readme.md#socialstack-tools");
	}
	
	return createDatabase(localConfig.databases.local, {
		databaseName: dbConfig.database,
		databaseUser: dbConfig.user,
		databasePassword: dbConfig.password,
		localConfig
	});
}

function dbSql(name, user, password){
	var createSchema = 'CREATE SCHEMA `' + name + '`';
	var createUser = 'CREATE USER \'' + user.replace('\'', '\\\'') + '\'@\'localhost\' IDENTIFIED BY \'' + password.replace('\'', '\\\'') + '\';' + 
			'GRANT ALL PRIVILEGES ON `' + name + '`.* TO \'' + user.replace('\'', '\\\'') + '\'@\'localhost\'';
	
	return [
		createSchema,
		createUser
	];
}

function createDatabase(connectionInfo, config){
	return new Promise((success, reject) => {
		config.databaseUser = config.databaseUser || config.databaseName + '_u';
		config.databasePassword = config.databasePassword || makeid(10);
		
		var dbType = connectionInfo.type || 'mysql';
		dbType = dbType.trim().toLowerCase();
		
		if(dbType == 'mongo' || dbType == 'mongodb'){
			console.log('Setting up Mongo database');
			
			config.databaseName = config.databaseName.replace('.', '_');
			const MongoClient = require('mongodb').MongoClient;
			var url = 'mongodb://' + (connectionInfo.server || 'localhost');
			
			var options = {useUnifiedTopology: true};
			
			if(connectionInfo.username){
				options['auth.user'] = connectionInfo.username;
				options['auth.password'] = connectionInfo.password;
			}
			
			MongoClient.connect(url, options, (err, client) => {
				
				if(err){
					console.log('Failed to connect to MongoDB. Here\'s the full error:');
					throw err;
				}
				
				var db = client.db(config.databaseName);
				var admin = db.admin();
				
				admin.addUser(config.databaseUser, config.databasePassword, {
					roles: [
					   { role: "dbOwner", db: config.databaseName }
					]
				}, (err,result) => {
					
					if(err && err.code == 51003){
						console.log('Database already existed - skipping setting it up entirely.');
						
						return success(config);
					}else if(result && result.ok){
						console.log('Database and user created. Setting up admin account.');
						
						// Create site admin account:
						createSiteAdmin({type: 'mongodb', db, client, close: ()=>client.close()}, config, success);
						
					}else{
						console.log('Unable to create MongoDB db/user:');
						throw err;
					}
					
				});
			});
			
		}else{
			console.log('Setting up MySQL database');
		}
		
		var sql = dbSql(config.databaseName, config.databaseUser, config.databasePassword);
		
		if(config.dbMode == 'offline'){
			// Outputs to a file:
			var tempPath = 'create-database.sql';
			
			fs.writeFile(tempPath, sql.join(';\r\n'), () => {
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
		  sql[0],
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
				sql[1],
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
	installDatabase,
	tidyUrl,
	generateInstallCommand
};