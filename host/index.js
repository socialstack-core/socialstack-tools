var path = require('path');
var fs = require('fs');
var { getHostsConfigDir, addHost, listHosts, getAppSettings } = require('./helpers.js');
var { findProjectRoot } = require('../projectHelpers/helpers.js');

// socialstack host -a mySiteProd1 -addr 100.100.100.100 -user luke -key path/to/key/file
// socialstack host -where
// socialstack host -list
// socialstack host -list subDirName
module.exports = (config) => {
	
	if(config.commandLine['a'] || config.commandLine['add']){
		// Adding a host.
		
		var hostName = config.commandLine['a'];
		var address = config.commandLine['addr'];
		var user = config.commandLine['user'];
		var key = config.commandLine['key'];
		var password = config.commandLine['p'];
		var remoteDir = config.commandLine['remoteDir']; // default is /var/www/
		var force = config.commandLine['f'] || config.commandLine['force'];
		
		if(key){
			key=key[0].trim();
		}
		
		if(remoteDir){
			remoteDir=remoteDir[0].trim();
		}
		
		if(password){
			password=password[0].trim();
		}
		
		if(user){
			user=user[0].trim();
		}
		
		if(address){
			address=address[0].trim();
		}
		
		findProjectRoot(config, () => {
			if(!remoteDir){
				var appsettings = getAppSettings(config);
				if(!appsettings || !appsettings.siteBasename){
					remoteDir = '/var/www';
				}else{
					remoteDir = '/var/www/' + appsettings.siteBasename;
				}
				console.log('Using "' + remoteDir + '" as the remote directory on this host. Generated webserver and service config defaults to "/var/www/PROJECT_URL" (you\'ll get this if you call host add from within a project).');
			}
			
			addHost({
				key,
				remoteDir,
				password,
				user,
				address,
				hostName,
				force
			}).then(result => {
			
				if(result.unchanged){
					console.log('A host called "' + hostName + '" is already configured. Use -f to force overwrite it. If you\'d like to inspect the file, its location is:');
					console.log(result.path);
				}else{
					console.log('Added "' + hostName + '"');
				}
			});
		});
		
	}else if(config.commandLine['w'] || config.commandLine['where']){
		// Output the location of the config.
		console.log(getHostsConfigDir());
		
	}else if(config.commandLine['list'] || config.commandLine['l']){
		// List of hosts. Can also use socialstack -list subDirName
		
		
		var relativeToName = config.commandLine['list'] || config.commandLine['l'];
		var relativeTo = null;
		
		if(relativeToName.length && relativeToName[0]){
			relativeTo = relativeToName[0];
		}
		
		listHosts(relativeTo).then(hosts => {
			console.log(hosts.length + ' host(s) configured');
			
			hosts.forEach(host => {
				console.log(host.name);
			});
		});
	}
	
};