"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Include the module build/ watch engine:
const index_js_1 = __importDefault(require("./modular/index.js"));
exports.default = {
    /*
    * Called by builder.js which is included in project files.
    */
    builder: (config) => {
        console.log("Obsolete build route. Upgrade your project to the latest SocialStack or use an older version of these tools.");
    },
    modular: index_js_1.default
};
