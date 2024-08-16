var configManager = require('../configManager');
var { uninstallModules } = require('../install/helpers.js');

module.exports = (config) => {
	
	var modules = config.commandLine['-'];
	
	if(!modules || !modules.length){
		console.log("Please specify the module(s) you'd like to uninstall");
	}
	
	uninstallModules(modules, config).then(() => {
		console.log('Done');
	}).catch(e => {
		console.log(e);
	});
};