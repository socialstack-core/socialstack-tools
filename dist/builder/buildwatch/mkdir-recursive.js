"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
// @ts-nocheck
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function default_1(root, mode, callback) {
    if (typeof mode === 'function') {
        var callback = mode;
        var mode = null;
    }
    if (typeof root !== 'string') {
        throw new Error('missing root');
    }
    else if (typeof callback !== 'function') {
        throw new Error('missing callback');
    }
    root = root.replace(/\//g, path_1.default.sep).replace(/\\/g, path_1.default.sep);
    var chunks = root.split(path_1.default.sep); // split in chunks
    var chunk;
    if (path_1.default.isAbsolute(root) === true) { // build from absolute path
        chunk = chunks.shift(); // remove "/" or C:/
        if (!chunk) { // add "/"
            chunk = path_1.default.sep;
        }
    }
    else {
        chunk = path_1.default.resolve(); // build with relative path
    }
    return mkdirRecursive(chunk, chunks, mode, callback);
}
;
/*
    * functions
    */
/**
    * make directory recursively
    *
    * @function mkdirRecursive
    * @param {String} root - absolute root where append chunks
    * @param {Array} chunks - directories chunks
    * @param {Number} mode - directories mode, see Node documentation
    * @param {Function} callback - next callback
    */
function mkdirRecursive(root, chunks, mode, callback) {
    var chunk = chunks.shift();
    if (!chunk) {
        return callback(null);
    }
    var root = path_1.default.join(root, chunk);
    return fs_1.default.mkdir(root, mode, function (err) {
        if (err && err.code !== 'EEXIST')
            return callback(err);
        return mkdirRecursive(root, chunks, mode, callback); // let's magic
    });
}
