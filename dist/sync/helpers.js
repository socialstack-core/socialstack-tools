"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const os_1 = __importDefault(require("os"));
const readline_1 = __importDefault(require("readline"));
const configManager_1 = __importDefault(require("../configManager"));
const { jsConfigManager } = configManager_1.default;
const configManager_2 = __importDefault(require("../configManager"));
const { jsConfigManager, settingsPath, getLocalConfig, setLocalConfig } = configManager_2.default;
function getProjectConfig(config) {
    var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
    var appsettings = appsettingsManager.get();
    return appsettings;
}
function setProjectConfig(appsettings, config) {
    var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
    appsettingsManager.update(appsettings);
}
function setUsername(username) {
    var cfg = getLocalConfig() || {};
    cfg.username = username;
    return setLocalConfig(cfg).then(() => username);
}
function getUsername() {
    var cfg = getLocalConfig();
    if (!cfg) {
        return os_1.default.hostname();
    }
    if (cfg.username) {
        return (cfg.username + '').trim();
    }
    return os_1.default.hostname();
}
function askFor(text, promptName, configSet) {
    return new Promise((success, reject) => {
        if (configSet[promptName] != undefined) {
            // Already set - skip.
            return success(configSet[configName]);
        }
        console.log(text);
        var rl = readline_1.default.createInterface(process.stdin, process.stdout);
        rl.setPrompt(promptName + ': ');
        rl.prompt();
        rl.on('line', function (line) {
            rl.close();
            success(line);
        });
    });
}
exports.default = {
    getProjectConfig,
    getUsername,
    setUsername,
    askFor,
    setProjectConfig
};
