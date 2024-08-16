var configManager = require('../configManager');
var { installModules } = require('./helpers.js');

module.exports = (config) => {
	
	var modules = config.commandLine['-'];
	
	if(!modules || !modules.length){
		console.log("Please specify the module(s) you'd like to install. If you're using flags, they go after your module names. Like this: 'socialstack install Api/Users -r'");
	}
	
	installModules(modules, config).then(() => {
		console.log('Done');
	}).catch(e => {
		console.log(e);
	});
};