"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const configManager_1 = __importDefault(require("../configManager"));
// socialstack repository -a mysite -addr https://mysite.com/path/to/repository-description.json
// Doing the above, assuming you setup a correct repo description, means you'll be able to have a private set of installable modules.
// The "alias" is defined by: -a mysite
// It is prefixed on a package name, like e.g. "socialstack install mysite:Api/Things"
// It supports packages, as well as alias usage inside packages.
// The description states the URL patterns for where your modules are. Example here:
// https://source.socialstack.dev/documentation/guide/blob/master/DeveloperGuide/Commands/repo-description.json
exports.default = (config) => {
    if (config.commandLine['a'] || config.commandLine['add']) {
        // Adding a repo.
        // -a (or -add) defines the alias.
        var alias = config.commandLine['a'] || config.commandLine['add'];
        var address = config.commandLine['addr'] || config.commandLine['url'];
        if (alias) {
            alias = alias[0].trim();
        }
        alias = alias.toLowerCase();
        if (address) {
            address = address[0].trim();
        }
        if (!address) {
            console.error('Please provide -addr "https://mysite.com/path/to/repo/description.json". ' +
                'The description states where to find the modules in your repository. ' +
                'For an example, see the repo description used by the core Socialstack repository: ' +
                '\r\n' +
                'https://source.socialstack.dev/documentation/guide/blob/master/DeveloperGuide/Commands/repo-description.json');
            return;
        }
        var localConfig = configManager_1.default.getLocalConfig();
        if (!localConfig.repositories) {
            localConfig.repositories = {};
        }
        localConfig.repositories[alias] = { remote: address };
        configManager_1.default.setLocalConfig(localConfig);
        console.log('Added or updated "' + alias + '"');
    }
    else if (config.commandLine['w'] || config.commandLine['where']) {
        // Output the location of the config.
        console.log(configManager_1.default.localConfigPath());
    }
    else if (config.commandLine['list'] || config.commandLine['l']) {
        // List of hosts. Can also use socialstack -list subDirName
        var localConfig = configManager_1.default.getLocalConfig();
        if (localConfig && localConfig.repositories) {
            var keys = Object.keys(localConfig.repositories);
            console.log(keys.length + ' host(s) configured');
            keys.forEach(key => {
                console.log(key);
                var host = localConfig.repositories[key];
                if (host && host.remote) {
                    console.log(' (for modules from "' + host.remote + '")');
                }
            });
        }
    }
};
