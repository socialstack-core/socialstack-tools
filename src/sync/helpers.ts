// @ts-nocheck
import os from 'os';
import readline from 'readline';
import mod_kdcb1 from '../configManager';
const { jsConfigManager   } = mod_kdcb1;
import mod_10l7k from '../configManager';
const { jsConfigManager, settingsPath, getLocalConfig, setLocalConfig   } = mod_10l7k;


function getProjectConfig(config) {
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
	var appsettings = appsettingsManager.get();
	
	return appsettings;
}

function setProjectConfig(appsettings, config){
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
	appsettingsManager.update(appsettings);
}

function setUsername(username){
	var cfg = getLocalConfig() || {};
	cfg.username = username;
	return setLocalConfig(cfg).then(() => username);
}

function getUsername() {
	var cfg = getLocalConfig();
	if(!cfg){
		return os.hostname();
	}
	if(cfg.username){
		return (cfg.username + '').trim();
	}
	return os.hostname();
}

function askFor(text, promptName, configSet) {
	return new Promise((success, reject) => {
		
		if(configSet[promptName] != undefined){
			// Already set - skip.
			return success(configSet[configName]);
		}
		
		console.log(text);
		
		var rl = readline.createInterface(process.stdin, process.stdout);
		rl.setPrompt(promptName + ': ');
		rl.prompt();
		rl.on('line', function(line) {
			rl.close();
			success(line);
		});	
	});
}

export default {
	getProjectConfig,
	getUsername,
	setUsername,
	askFor,
	setProjectConfig
};