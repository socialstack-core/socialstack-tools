var configManager = require('../configManager');
var { uninstallModule } = require('../install/helpers.js');

module.exports = (config) => {
	
	var modules = config.commandLine['-'];
	
	if(!modules || !modules.length){
		console.log("Please specify the module(s) you'd like to uninstall");
	}
	
	var pendingRemovals = [];
	
	for(var i=0;i<modules.length;i++){
		console.log('Attempting to uninstall ' + modules[i]);
		pendingRemovals.push(uninstallModule(modules[i], config, true));
	}
	
	Promise.all(pendingRemovals).then(() => {
		console.log('Done');
	});
};