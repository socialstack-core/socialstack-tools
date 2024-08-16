var { jsConfigManager, getLocalConfig, setLocalConfig } = require('../configManager');
var readline = require('readline');
var fetch = require('node-fetch');
var Writable = require('stream').Writable;
var fs = require('fs');
var path = require('path');


function hasGroupConfig(dirPath, callback){
	// True if this directory has socialstackCloud.json in it
	function fileReturn(err, stats){
		callback(!err && stats.isFile());
	}
	
	fs.stat(dirPath + '/socialstackCloud.json', fileReturn);
}

/*
* Finds the cloud group root directory, or errors if it wasn't possible.
* Calls the given done callback as done(config) if it was successful.
*/
function findGroupConfig(config){
	return new Promise((s, r) => {
		var intermediateDirNames = [];
		var currentPath = config.calledFromPath;
		
		function onCheckedRoot(success){
			if(success){
				s({groupPath: currentPath, intermediates: intermediateDirNames});
			}else{
				var nextPath = path.dirname(currentPath);
				intermediateDirNames.push(path.basename(currentPath));
				
				if(currentPath == nextPath){
					// Nope!
					s({groupPath: null, intermediates: intermediateDirNames});
					return;
				}else{
					currentPath = nextPath;
					hasGroupConfig(currentPath, onCheckedRoot);
				}
			}
		}
		
		hasGroupConfig(currentPath, onCheckedRoot);
	});
}


function runCmd(config){
	// Cmd args:
	var commandLineArgs = config.commandLine;
	
	console.log('SocialStack Cloud');
	
	// Has this project been deployed before?
	// It'll always have an appsettings.prod.json file with a cloud project ID inside it if yes:
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.prod.json");
	var appsettings = appsettingsManager.get();
	
	var cloud = appsettings ? (appsettings.Cloud || appsettings.cloud) : null;
	
	if(cloud && (cloud.ProjectId || cloud.projectId)){
		
		// Existing cloud deployment.
		console.log('Deploying to existing cloud project now');
		
	}else{
		// New cloud deployment.
		startCloudDeployment(config);
	}
}

var mutableStdout = new Writable({
  write: function(chunk, encoding, callback) {
    if (!this.muted)
      process.stdout.write(chunk, encoding);
    callback();
  }
});

function askFor(text, configName, configSet, muted){
	return new Promise((success, reject) => {
		
		if(configSet[configName] != undefined){
			// Already set - skip.
			return success(configSet, configName, configSet[configName]);
		}
		
		text && console.log(text);
		
		var rl = readline.createInterface({input:process.stdin, output:mutableStdout, terminal: true});
		
		mutableStdout.muted = false;
		rl.setPrompt(configName + (muted ? ' (we\'re hiding what you type)' : '') + ': ');
		
		rl.prompt();
		
		mutableStdout.muted = muted;
		rl.on('line', function(line) {
			configSet[configName] = line;
			rl.close();
			success(configSet, configName, line);
		});	
	});
}

function getHost(localCfg){
	var host = 'https://socialstack.cloud';
	
	if(localCfg && localCfg.cloud && localCfg.cloud.host){
		host = localCfg.cloud.host;
	}
	
	return host;
}

function tryLogin(userAuth, host){
	return fetch(host + '/v1/user/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(userAuth)
	}).then(response => response.text().then(txt => {
		if(!txt){
			console.error('Hmm, those details weren\'t right.');
			return false;
		}
		
		var json = JSON.parse(txt);
		
		if(json.message){
			
			// Some other general error, e.g. locked account
			console.error(json.message);
			return false;
			
		}else if(json.moreDetailRequired){
			
			// 2FA
			return askFor(
				"Two factor authentication is enabled on this account. Please provide the current pin.",
				"google2FAPin",
				userAuth
			).then(() => tryLogin(userAuth, host))
			
		}else if(response.status == 200){
			
			// Get the token. The context (logged in user) is the full response:
			var context = json;
			var token = response.headers.get('token');
			
			if(Array.isArray(token)){
				token = token[0];
			}
			
			return {
				context: json,
				token
			};
		}
		
	}))
	.catch(e=>{
		console.error('Those login details weren\'t right.');
	});
}

function get(url, config){
	return fetch(config.host + '/v1/' + url, {
		headers: {
			'Token': config.token
		}
	})
}

function post(url, config, bodyObj){
	return fetch(config.host + '/v1/' + url, {
		method: 'POST',
		headers: {
			'Token': config.token,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(bodyObj)
	})
	.then(res => res.text())
	.then(txt => {
		if(!txt){
			return {};
		}else{
			return JSON.parse(txt);
		}
	});
}

/*
* Get cloud auth token (basically logs in to SS cloud).
*/
function getAuth(){
	var localCfg = getLocalConfig();
	var token = (localCfg && localCfg.cloud) ? localCfg.cloud.token : null;
	
	var host = getHost(localCfg);
	
	if(token){
		// Validate the token by asking the /self endpoint:
		var requestConfig = {
			host,
			token
		};
		
		return get('user/self', requestConfig)
			.then(response => response.json())
			.then(context => {
				return {
					toolsConfig: localCfg,
					context,
					requestConfig
				}
			})
			.catch(e=>{
				// Invalid token
				console.log('Login token has expired - please login again.');
				return loginNow(localCfg, host);
			});
		
	}else{
		console.log("Hello! This looks like the first time. Please login with your account on " + host + ":");
	}
	
	return loginNow(localCfg, host);
}

function loginNow(localCfg, host){
	var userAuth = {};
	
	return askFor(null, "emailOrUsername", userAuth)
		.then(() => askFor(null, "password", userAuth, true))
		.then(() => {
			// Attempt to login:
			console.log('Logging in..');
			
			return tryLogin(userAuth, host).then(result => {
				console.log('Login success');
				
				if(!localCfg){
					localCfg = {};
				}
				
				if(!localCfg.cloud){
					localCfg.cloud = {};
				}
				
				localCfg.cloud.token = result.token;
				
				// Update local config and ultimately resolve as complete local config:
				return setLocalConfig(localCfg).then(() => {
					
					return {
						toolsConfig: localCfg,
						context: result.context,
						requestConfig: {
							host,
							token:result.token
						}
					};
				});
			});
		});
	
}

function customisePath(){
	var customPath = {};
	return askFor(null, 'projectPath', customPath).then(() => {
		var projectPath = customPath.projectPath;
		
		if(!projectPath || projectPath.indexOf('/') == -1)
		{
			console.log('Your path must contain at least one / to indicate the parent group followed by the project itself. We recommend this:');
			console.log('');
			console.log('My Company / Customer Name / Project Name');
			console.log('Groups that don\'t exist will be automatically created.');
			console.log('');
			
			// Go again:
			return customisePath();
		}
		else
		{
			// resolve as the path:
			return projectPath.trim();
		}
	});
}

function startCloudDeployment(config){

	var project = {
		autoAllocated: true
	};
	
	var auth;
	
	getAuth()
	.then(a => {
		auth = a;
		auth.get = url => get(url, auth.requestConfig);
		auth.post = (url, bodyObj) => post(url, auth.requestConfig, bodyObj);
		
		return askFor(
			'How many people approx will be using this site at the same time? Just press enter to get a default single server instance.',
			'peopleExpected',
			project
		);
	})
	.then(() => {
		
		if(!project.peopleExpected){
			project.peopleExpected = 0;
		}else{
			project.peopleExpected = parseInt(project.peopleExpected.trim());
		}
		
		console.log('Over on the cloud dashboard, we use groups to organise things. Figuring out which group your project goes in..');
		
		return findGroupConfig(config)
			.then(groupAndIntermediateDirs => {
				
				var projectName = groupAndIntermediateDirs.intermediates.shift();
				
				if(groupAndIntermediateDirs.groupPath != null){
					
					var mngr = new jsConfigManager(groupAndIntermediateDirs.groupPath + "/socialstackCloud.json");
					var groupInfo = mngr.get();
					
					var projectPath = (groupInfo.GroupName || groupInfo.groupName) + ' / ';
					
					// Intermediate directories can be automatically created as groups too:
					var intermediates = groupAndIntermediateDirs.intermediates;
					
					for(var i=intermediates.length - 1; i>=0;i--){
						projectPath += intermediates[0] + ' / ';
					}
					
					projectPath += projectName;
					
					console.log('Is this path ok, with the project called "' + projectName + '"? Press enter to accept, or n to customise.');
					console.log('');
					console.log(projectPath);
					console.log('');
					
					var acceptPathResp = {};
					return askFor(null, 'acceptPath', acceptPathResp).then(() => {
						
						if(acceptPathResp.acceptPath){
							var userResponse = acceptPathResp.acceptPath.trim().toLowerCase();
							if(userResponse == 'n' || userResponse == 'no' || userResponse == 'edit' || userResponse == 'nope'){
								
								console.log('Please enter the path you\'d like to use. It must contain a group and the project name. We recommend something like this:');
								console.log('My Company / Customer Name / Project Name');
								console.log('');
								return customisePath();
							}else{
								return projectPath;
							}
						}else{
							return projectPath;
						}
					});
					
				}else{
					// No identified group path
					console.log(
						'Didn\'t find any socialstackCloud.json files. Placing one of these in a parent directory to the project means the project ' + 
						'will automatically be placed into a group with the given name. Search "socialstackCloud.json" For more information.'
					);
					
					console.log('Instead, please enter the path you\'d like to use. We recommend something like this:');
					console.log('');
					console.log('My Company / Customer Name / Project Name');
					console.log('');
					
					return customisePath();
				}
				
			});
	})
	.then(projectPath => {
		
		var pathParts = projectPath.split('/');
		project.name = pathParts.pop().trim();
		
		var groupPath = pathParts.join('/');
		
		console.log('Obtaining group information..');
		
		return auth.post('group/byhierarchy', {
			groupPath
		});
		
	})
	.then(groupAndPolicy => {
		project.groupId = groupAndPolicy.group.id;
		
		var policy = groupAndPolicy.policy;
		
		console.log('The selected group uses the following deployment settings:');
		console.log('');
		console.log('Host: ' + policy.hostPlatform.name);
		console.log('Region: ' + policy.region.name);
		console.log('Backups: ' + backupModeText(policy.backupMode));
		console.log('With stage environment: ' + stageModeText(policy.stageCreationMode));
		console.log('');
		console.log('Are these settings ok for your project? Just press enter to accept.');
		
		var resp = {};
		return askFor(null, 'settings', {}).then(() => {
			
			var response = (resp.settings || '').trim().toLowerCase();
			
			if(response == '' || response == 'ok' || response == 'y' || response == 'yes' || response == 'yeah'){
				return true;
			}else{
				console.log('TODO - unfortunately changing the settings isn\'t available through the CLI just yet. Your group(s) exist though, so please change the settings on that instead through the UI.');
			}
			
		});
	})
	.then(() => {
		console.log('Creating..');
		return auth.post('project', project);
	})
	.then(projectResult => {
		console.log('\x1b[4mProject created!\x1b[0m It\'ll be available online shortly using the following domain names.');
		console.log('');
		console.log('Stage: ' + projectResult.autoDns + '.stage.socialstack.cloud');
		console.log('Live: ' + projectResult.autoDns + '.live.socialstack.cloud');
		console.log('');
		console.log('To assign custom domain names, use the "socialstack assign" command.');
	});
}

function stageModeText(mode){
	if(mode == 0){
		return 'No stage environment';
	}else if(mode == 1){
		return 'Yes - A single, standard server (not exact replica)';
	}else if(mode == 2){
		return 'Yes - An exact replica of live';
	}
}

function backupModeText(mode){
	if(mode == 0){
		return 'Off';
	}else if(mode == 1){
		return 'Live site only (stage won\'t be backed up)';
	}else if(mode == 2){
		return 'Live and stage';
	}
}

module.exports = {
	runCmd,
	startCloudDeployment
};