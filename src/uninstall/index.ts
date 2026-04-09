import { SocialStackConfig } from '../types';
import { uninstallModules, uninstallTemplate } from '../install/helpers';

export const run = async (config: SocialStackConfig) => {
    const modules = config.commandLine['-'];
    const template = config.commandLine.template;

    if (!modules || !modules.length) {
        if (template) {
            try {
                await uninstallTemplate(template, config);
                console.log('Done');
                return;
            } catch (e) {
                console.log(e.message || e);
                return;
            }
        }
        console.log("Please specify the module(s) you'd like to uninstall. Like this: 'socialstack uninstall Api/Users'");
        console.log("Or uninstall a template: 'socialstack uninstall --template standard'");
        return;
    }

    try {
        await uninstallModules(modules, config);
        console.log('Done');
    } catch (e) {
        console.log(e.message || e);
    }
};
