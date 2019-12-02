var configManager = require('../configManager');
var https = require('https');

var apiHost = 'source.socialstack.cf';
var urlPrefix = '/api/v4/';
var coreGroupIds = {
	"ui": 4,
	"api": 5,
	"admin": 7
};

function webRequest(url, fields){
	
	return new Promise((success, reject) => {
		
		const data = JSON.stringify(fields);
		
		var req = https.request({
			hostname: apiHost,
			port: 443,
			path: urlPrefix + url,
			method: fields ? 'POST' : 'GET',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': data.length
			}
		}, function(response) {
			
			response.setEncoding('utf8');
			
			var payload = '';
			
			response.on('data', d => {
				payload+=d;
			});
			
			response.on('close', function() {
				success(JSON.parse(payload));
			});
		});
		
		req.write(data);
		req.end();
		
	});
	
}

module.exports = (config) => {
	
	// Adds this dir to the source repo.
	
	if(!config.commandLine.d){
		console.log('A description is required. Please use "socialstack add -d "Your description here".');
		return;
	}
	
	// The module we're in is..
	var modulePath = config.calledFromPath.substring(config.projectRoot.length).replace(/\\/gi, '/').replace('/Source/', '/').replace('/ThirdParty/', '/');
	
	if(!modulePath.length){
		console.log('Call this from within the module you want to add. You\'re current working directory is set to the project root.');
		return;
	}
	
	if(modulePath[0] == '/'){
		modulePath = modulePath.substring(1);
	}
	
	if(!modulePath.length){
		console.log('Call this from within the module you want to add. You\'re current working directory is set to the project root.');
		return;
	}
	
	// Must start with Admin/, UI/ or Api/ to form the standard set of modules:
	if(modulePath.indexOf('Admin/') != 0 && modulePath.indexOf('UI/') != 0&& modulePath.indexOf('Api/') != 0){
		console.log('You can only add Admin, UI or Api modules. That means you\'ll need to be inside e.g. your Api/Thing directory.');
		return;
	}
	
	var description = config.commandLine.d[0];
	
	// Repeatedly search for the parent module.
	var parts = modulePath.toLowerCase().split('/');
	parts.pop();
	
	/*
	while(parts.length){
		
		parts.join('/');
		
		parts.pop();
		
		
	}
	
	console.log(config, modulePath);
	*/
	/*
	webRequest('projects', {
		namespace_id: modulesGroup,
		path: modulePath.toLowerCase(),
		description
	}).then(response => {
		
		console.log(response);
		
	})
	*/
};