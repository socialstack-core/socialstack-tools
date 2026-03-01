// @ts-nocheck
import fs from 'fs';

// Include the module build/ watch engine:
import modular from './modular/index.js';


export default {
	
	/*
	* Called by builder.js which is included in project files.
	*/
	builder: (config) => {
		console.log("Obsolete build route. Upgrade your project to the latest SocialStack or use an older version of these tools.");
	},
	
	modular
};