"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
// @ts-nocheck
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function default_1(pathname) {
    pathname = path_1.default.resolve(pathname);
    let paths = pathname.split(path_1.default.sep);
    for (let i = 1; i < paths.length; i++) {
        let dirpath = paths.slice(0, i + 1).join(path_1.default.sep);
        !fs_1.default.existsSync(dirpath) && fs_1.default.mkdirSync(dirpath);
    }
}
;
