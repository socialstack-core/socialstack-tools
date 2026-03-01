import { SocialStackConfig } from '../types';
import configManager from '../configManager';
import mod_wrxq8 from '../install/helpers.js';
const { uninstallModules   } = mod_wrxq8;

export default (config: SocialStackConfig) => {
	
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