import { SocialStackConfig } from '../types';
import configManager from '../configManager';
import mod_w5dyg from './helpers.js';
const { installModules } = mod_w5dyg;

export default (config: SocialStackConfig) => {

	var modules = config.commandLine['-'];

	if (!modules || !modules.length) {
		console.log("Please specify the module(s) you'd like to install. If you're using flags, they go after your module names. Like this: 'socialstack install Api/Users -r'");
	}

	installModules(modules, config, false).then(() => {
		console.log('Done');
	}).catch(e => {
		console.log(e);
	});
};