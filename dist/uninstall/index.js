"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_js_1 = __importDefault(require("../install/helpers.js"));
const { uninstallModules } = helpers_js_1.default;
exports.default = (config) => {
    var modules = config.commandLine['-'];
    if (!modules || !modules.length) {
        console.log("Please specify the module(s) you'd like to uninstall");
    }
    uninstallModules(modules, config).then(() => {
        console.log('Done');
    }).catch(e => {
        console.log(e);
    });
};
