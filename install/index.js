var configManager = require('../configManager');
var { installModule } = require('./helpers.js');

module.exports = (config) => {
	
	// Did we have the -r flag, or is it implied from the user's config file?
	
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
	
	var modules = config.commandLine['-'];
	
	if(!modules || !modules.length){
		console.log("Please specify the module(s) you'd like to install. If you're using flags, they go after your module names. Like this: 'socialstack install Api/Users -r'");
	}
	
	var pendingDownloads = [];
	
	for(var i=0;i<modules.length;i++){
		console.log('Attempting to install ' + modules[i]);
		pendingDownloads.push(installModule(modules[i], config, asSubModule, useHttps));
	}
	
	Promise.all(pendingDownloads).then(() => {
		console.log('Done');
	}).catch(e => {
		console.log(e);
	});
};