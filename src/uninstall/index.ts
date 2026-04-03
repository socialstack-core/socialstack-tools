import { SocialStackConfig } from '../types';
import { uninstallModules } from '../install/helpers';

export const run = async (config: SocialStackConfig) => {
    var modules = config.commandLine['-'];

    if (!modules || !modules.length) {
        console.log("Please specify the module(s) you'd like to uninstall. Like this: 'socialstack uninstall Api/Users'");
        return;
    }

    try {
        await uninstallModules(modules, config);
        console.log('Done');
    } catch (e) {
        console.log(e.message || e);
    }
};
