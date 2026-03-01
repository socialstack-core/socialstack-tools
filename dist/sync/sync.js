"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_js_1 = __importDefault(require("./helpers.js"));
const { getProjectConfig, setProjectConfig, getUsername, setUsername, askFor } = helpers_js_1.default;
/*
* socialstack sync
*/
function setupUsername() {
    return askFor('Please provide a username to identify yourself to the rest of your team. It\'s often an email address', 'username', {})
        .then(name => setUsername(name))
        .then(name => {
        console.log('Username saved.');
        return name;
    });
}
function setup(config) {
    var username = getUsername();
    return (username ? Promise.resolve(username) : setupUsername())
        .then(name => {
        // Get project config and see if this username is in it:
        var projectCfg = getProjectConfig(config);
        var cfg = projectCfg ? projectCfg.ContentSync : null;
        if (cfg && cfg.Users) {
            if (cfg.Users[username]) {
                return cfg;
            }
            else {
                console.log('This project is configured to use sync, but your username is not currently allocated anything. Ask your team to allocate your username (' + name + ') a block in appsettings.json.');
                return false;
            }
        }
        else {
            return askFor('This project doesn\'t have sync enabled yet. Would you like to set it up and allocate yourself now? [y/n]', 'self', {})
                .then(response => {
                if (response == 'y') {
                    // Inserting into appsettings.json
                    var userSet = {};
                    userSet[name] = [{ Min: 1, Max: 100, StepSize: 1 }];
                    projectCfg.ContentSync = cfg = {
                        Users: userSet
                    };
                    setProjectConfig(projectCfg, config);
                    return cfg;
                }
                else {
                    return false;
                }
            });
        }
    });
}
exports.default = (config) => {
    var opts = config.commandLine;
    var firstOpt = opts['-'] && opts['-'].length ? opts['-'][0] : null;
    if (firstOpt == 'whoami') {
        var username = getUsername();
        console.log(username || 'sync user not configured');
    }
    else if (firstOpt == 'setup') {
        setupUsername();
    }
    else if (firstOpt === null) {
        setup(config)
            .then(syncConfig => {
            if (!syncConfig) {
                return;
            }
            console.log('Forced sync coming soon. In the meantime, updates you make (and are made by other people) are handled automatically.', syncConfig);
        });
    }
};
