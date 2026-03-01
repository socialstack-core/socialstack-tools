"use strict";
// @ts-nocheck
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
* Checks if the given directory is a socialstack project root.
* Calls the given callback as callback(isRoot) where isRoot is true/false.
*/
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function isProjectRoot(dirPath, callback) {
    // The root can be identified by looking for the dir with 'UI' and 'Api' child directories.
    var pending = 2;
    var matched = false;
    function dirReturn(err, stats) {
        pending--;
        if (!err && stats.isDirectory()) {
            matched = true;
        }
        if (pending == 0) {
            callback(matched);
        }
    }
    fs_1.default.stat(dirPath + '/UI', dirReturn);
    fs_1.default.stat(dirPath + '/Api', dirReturn);
}
/*
* Finds the project root directory, or errors if it wasn't possible.
* Calls the given done callback as done(config) if it was successful.
*/
function findProjectRoot(config, done) {
    if (config.commandLine.root) {
        var rootSpec = config.commandLine.root[0];
        config.projectRoot = rootSpec;
        done(config);
        return;
    }
    else if (config.commandLine.rootcwd) {
        config.projectRoot = config.calledFromPath;
        done(config);
        return;
    }
    var currentPath = config.calledFromPath;
    function onCheckedRoot(success) {
        if (success) {
            config.projectRoot = currentPath;
            done(config);
        }
        else {
            var nextPath = path_1.default.dirname(currentPath);
            if (currentPath == nextPath) {
                // Nope!
                done(null);
                return;
            }
            else {
                currentPath = nextPath;
                isProjectRoot(currentPath, onCheckedRoot);
            }
        }
    }
    isProjectRoot(currentPath, onCheckedRoot);
}
exports.default = {
    findProjectRoot,
    isProjectRoot
};
