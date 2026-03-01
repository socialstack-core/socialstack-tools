"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const appdata_path_1 = __importDefault(require("appdata-path"));
var adp = (0, appdata_path_1.default)('socialstack');
var settingsPath = adp + path_1.default.sep + 'settings.json';
var _localConfig;
/*
* Reads the global socialstack config info (sequentially)
*/
function getLocalConfig() {
    if (_localConfig) {
        return _localConfig;
    }
    return _localConfig = new jsConfigManager(settingsPath).get();
}
function localConfigPath() {
    return settingsPath;
}
function jsConfigManager(filepath) {
    this.get = function () {
        try {
            var file = fs_1.default.readFileSync(filepath, { encoding: 'utf8' });
            // Strip BOM:
            file = file.replace(/^\uFEFF/, '');
        }
        catch (e) {
            // Doesn't exist
            return {};
        }
        var result;
        try {
            result = JSON.parse(file);
        }
        catch (e) {
            console.error('A JSON settings file failed to parse. It\'s at ' + filepath + '. Try opening the file and validating it in a JSON validator. Here\'s the full error: ');
            throw e;
        }
        return result;
    };
    this.update = function (newCfg) {
        fs_1.default.writeFileSync(filepath, JSON.stringify(newCfg, null, 4), { encoding: 'utf8' });
    };
}
function setLocalConfig(cfg) {
    return new Promise((s, r) => {
        // Ensure dir exists:
        fs_1.default.mkdir(adp, { recursive: true }, (err) => {
            if (err && err.code != 'EEXIST')
                throw err;
            var settingsPath = adp + path_1.default.sep + 'settings.json';
            // Write to it:
            fs_1.default.writeFile(settingsPath, JSON.stringify(cfg, null, '\t'), err => err ? r(err) : s());
        });
    });
}
exports.default = {
    jsConfigManager,
    getLocalConfig,
    settingsPath,
    setLocalConfig,
    localConfigPath
};
