"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_js_1 = __importDefault(require("../create/helpers.js"));
const { installDatabase } = helpers_js_1.default;
exports.default = (config) => {
    installDatabase(config).then(() => {
        console.log('Done');
    }).catch(e => {
        if (e && e.message) {
            console.error(e.message);
        }
        else {
            console.error(e);
        }
    });
};
