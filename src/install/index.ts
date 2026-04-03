import { SocialStackConfig } from '../types';
import { installModules } from './helpers';

export const run = async (config: SocialStackConfig) => {
    var modules = config.commandLine['-'];

    if (!modules || !modules.length) {
        console.log("Please specify the module(s) you'd like to install. Like this: 'socialstack install Api/Users'");
        return;
    }

    try {
        await installModules(modules, config.projectRoot);
        console.log('Done');
    } catch (e) {
        console.log(e.message || e);
    }
};
