"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const mkdirDeep_js_1 = __importDefault(require("./mkdirDeep.js"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function copyStaticFile(fullPath, targetPath, onlyIfNewer, onDone) {
    return new Promise((onDone) => {
        function copyTheFile() {
            // Make target dir if it doesn't exist:
            // Clean the dirs:
            fullPath = fullPath.replace(/\\/g, path_1.default.sep).replace(/\//g, path_1.default.sep);
            targetPath = targetPath.replace(/\\/g, path_1.default.sep).replace(/\//g, path_1.default.sep);
            var from = path_1.default.resolve(fullPath);
            var to = path_1.default.resolve(targetPath);
            // Targeting dir:
            var targetDirectory = path_1.default.dirname(to);
            // Make sure dir exists:
            (0, mkdirDeep_js_1.default)(targetDirectory);
            // Copy into it:
            fs_1.default.copyFile(from, to, (err) => {
                if (err) {
                    console.error(err);
                    return;
                }
                // Ok:
                onDone();
            });
        }
        if (onlyIfNewer) {
            // Get file stats for both:
            var pending = [null, null];
            fs_1.default.stat(fullPath, function (err, stats) {
                onStats(0, err, stats);
            });
            fs_1.default.stat(targetPath, function (err, stats) {
                onStats(1, err, stats);
            });
            function onStats(index, err, stats) {
                pending[index] = { err, stats };
                if (!pending[0] || !pending[1]) {
                    return;
                }
                // Copy is required if:
                // - Either errored (first one ideally never does)
                // - [0] write time is after [1] write time:
                // - They're different sizes
                if (pending[0].err || pending[1].err ||
                    pending[0].stats.mtime > pending[1].stats.mtime ||
                    pending[0].stats.size != pending[1].stats.size) {
                    // Copy required:
                    copyTheFile();
                }
                else {
                    // Copy wasn't needed - file is already up to date.
                    onDone();
                }
            }
        }
        else {
            // Copy now:
            copyTheFile();
        }
    });
}
exports.default = copyStaticFile;
