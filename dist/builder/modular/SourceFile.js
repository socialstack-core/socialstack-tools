"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
var SourceFileType = require('./SourceFileType.js');
class SourceFile {
    constructor(filePath, rootName, sourcePath, packDir, stats) {
        this.priority = 100;
        if (!sourcePath.endsWith(path_1.default.sep)) {
            sourcePath += path_1.default.sep;
        }
        var lastSlash = filePath.lastIndexOf(path_1.default.sep);
        var fileName = filePath.substring(lastSlash + 1);
        var relLength = lastSlash - sourcePath.length - 1;
        var modifiedUnixTs = stats.mtimeMs;
        var fileSize = stats.size;
        this.fileSize = fileSize;
        this.modifiedUnixTs = modifiedUnixTs;
        if (!fileName) {
            // Directory
            this.invalid = true;
            return;
        }
        var relativePath = relLength > 0 ? filePath.substring(sourcePath.length, lastSlash) : "";
        var typeDot = fileName.lastIndexOf('.');
        if (typeDot == -1) {
            // Directory
            this.invalid = true;
            return;
        }
        var fileType = fileName.substring(typeDot + 1).toLowerCase();
        var fileNameNoType = fileName.substring(0, typeDot);
        if (fileType == 'git') {
            // Git directory
            this.invalid = true;
            return;
        }
        // Check if the file name matters to us:
        var tidyFileType = filePath.indexOf(path_1.default.sep + "static" + path_1.default.sep) == -1 ?
            this.determineFileType(fileType, fileName) :
            SourceFileType.None;
        if (tidyFileType == SourceFileType.None) {
            // Static content:
            this.isStaticFile = true;
            this.path = filePath;
            this.targetPath = packDir + '/static/' + relativePath.toLowerCase() + '/' + fileName.toLowerCase();
            return;
        }
        // Yes - load it.
        var isGlobal = false;
        var priority = 100;
        if (tidyFileType == SourceFileType.Scss) {
            // Is it a global SCSS file?
            isGlobal = fileName.indexOf(".global.") != -1 || fileName.startsWith("global.");
            // 2nd last part of the file can be a number - the priority order of the scss.
            var parts = fileName.split('.');
            if (parts.length > 2) {
                var prio2 = parseInt(parts[parts.length - 2]);
                if (!isNaN(prio2)) {
                    priority = prio2;
                }
            }
        }
        // Is it a thirdparty module?
        var thirdParty = false;
        var modulePath = rootName + '/' + relativePath.replace(/\\/gi, '/');
        if (modulePath.indexOf("/ThirdParty/") != -1) {
            thirdParty = true;
            // Remove /ThirdParty/ and build module path that it represents:
            modulePath = modulePath.replace("/ThirdParty/", "/");
        }
        if (modulePath.indexOf(".Bundle/") != -1) {
            // Remove *.Bundle/ and build module path that it represents:
            var pieces = modulePath.split('/');
            var newPath = "";
            for (var i = 0; i < pieces.length; i++) {
                if (pieces[i].endsWith(".Bundle")) {
                    continue;
                }
                if (newPath != "") {
                    newPath += "/";
                }
                newPath += pieces[i];
            }
            modulePath = newPath;
        }
        // Use shortform module name if the last directory of the modulePath matches the filename.
        if (!modulePath.endsWith("/" + fileNameNoType)) {
            if (modulePath.endsWith("/")) {
                modulePath += fileName;
            }
            else {
                modulePath += "/" + fileName;
            }
        }
        this.isStaticFile = false;
        this.path = filePath;
        this.fileName = fileName;
        this.isGlobal = isGlobal;
        this.priority = priority;
        this.fileType = tidyFileType;
        this.rawFileType = fileType;
        this.thirdParty = thirdParty;
        this.modulePath = modulePath;
        this.fullModulePath = rootName + '/' + relativePath.replace(/\\/gi, '/');
        this.relativePath = relativePath;
    }
    /// <summary>
    /// Determines the given file name + type as a particular useful source file type. "None" if it didn't.
    /// </summary>
    /// <param name="fileType"></param>
    /// <param name="fileName"></param>
    /// <returns></returns>
    determineFileType(fileType, fileName) {
        if (fileType == "js" || fileType == "jsx" || ((fileType == "ts" || fileType == "tsx") && !fileName.endsWith(".d.ts") && !fileName.endsWith(".d.tsx"))) {
            return SourceFileType.Javascript;
        }
        else if (fileType == "css" || fileType == "scss") {
            return SourceFileType.Scss;
        }
        else if (fileName == "module.json") {
            return SourceFileType.ModuleMeta;
        }
        return SourceFileType.None;
    }
    isStarterModule() {
        return this.modulePath == "UI/Start";
    }
    /// <summary>
    /// Loads this files textual content into "this.content".
    /// </summary>
    loadTextContent() {
        return this.loadTextFile(this.path).then(content => {
            this.content = content;
        });
    }
    /// <summary>
    /// Loads a text file at the given path, in utf8. It can also have a BOM.
    /// </summary>
    loadTextFile(path) {
        return new Promise((s, r) => {
            fs_1.default.readFile(path, { encoding: 'utf8' }, function (err, fileContent) {
                if (err) {
                    return r(err);
                }
                // drop the BOM
                if (fileContent.length && fileContent.charCodeAt(0) === 0xFEFF) {
                    fileContent = fileContent.slice(1);
                }
                s(fileContent);
            });
        });
    }
}
exports.default = SourceFile;
