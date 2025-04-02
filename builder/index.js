var fs = require('fs');

// Include the module build/ watch engine:
var modular = require('./modular/index.js');


module.exports = {
	
	/*
	* Called by builder.js which is included in project files.
	*/
	builder: (config) => {
		console.log("Obsolete build route. Upgrade your project to the latest SocialStack or use an older version of these tools.");
	},
	
	modular
};