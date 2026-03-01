"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const fs_1 = __importDefault(require("fs"));
var allFilesInDirectory = require('./allFilesInDirectory.js');
var SourceFile = require('./SourceFile.js');
/// <summary>
/// A collection of source files.
/// </summary>
class SourceFileContainer {
    /// <summary>
    /// The name of the files in this group.
    /// </summary>
    rootName = '';
    /// <summary>
    /// Base file path to the location of source files in this container.
    /// </summary>
    sourcePath = '';
    /// <summary>
    /// The SourceFile files in the group.
    /// </summary>
    files = [];
    /// <summary>
    /// Create a new collection of source files.
    /// </summary>
    /// <param name="sourcePath">Must be normalised and absolute.</param>
    /// <param name="rootName"></param>
    constructor(sourcePath, rootName, packDir) {
        this.sourcePath = sourcePath;
        this.rootName = rootName;
        this.packDir = packDir;
    }
    start() {
        if (!fs_1.default.existsSync(this.sourcePath)) {
            return Promise.resolve(true);
        }
        // Iterate through the directory tree of SourcePath and populate the initial map now.
        return allFilesInDirectory(this.sourcePath, true).then(fileStatList => {
            // Build the map of all src files now.
            for (var i = 0; i < fileStatList.length; i++) {
                var fileAndStats = fileStatList[i];
                this.addFile(fileAndStats.path, fileAndStats.stats);
            }
        });
    }
    addFile(absolutePath, stats) {
        var file = new SourceFile(absolutePath, this.rootName, this.sourcePath, this.packDir, stats);
        this.files.push(file);
    }
}
exports.default = SourceFileContainer;
