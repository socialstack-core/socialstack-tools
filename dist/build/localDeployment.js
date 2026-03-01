"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
async function createDirectories(target, directories) {
    for (const dir of directories) {
        await fs_1.promises.mkdir(path_1.default.join(target, dir), { recursive: true });
    }
}
async function rotateDirectories(target) {
    const deployDir = path_1.default.join(target, 'deploy');
    const prev2 = path_1.default.join(deployDir, 'prev-2');
    const prev1 = path_1.default.join(deployDir, 'prev-1');
    const prev = path_1.default.join(deployDir, 'prev');
    await fs_1.promises.rm(prev2, { recursive: true, force: true });
    await moveDirectoryIgnoreIfNotFound(prev1, prev2);
    await moveDirectoryIgnoreIfNotFound(prev, prev1);
}
async function moveDirectoryIgnoreIfNotFound(src, target) {
    // This is ok to fail quietly but only in the "not found" situation.
    try {
        await fs_1.promises.rename(src, target);
    }
    catch (error) {
        if (error && error.code == 'ENOENT') {
            // A previous deployment didn't exist so there is nothing to move out of the way - this is fine.
            return;
        }
        throw error;
    }
}
async function writeFile(filePath, jsonString) {
    await fs_1.promises.writeFile(filePath, jsonString, 'utf8');
}
async function copyUIBundle(target, projectRoot, bundle) {
    await moveDirectoryIgnoreIfNotFound(path_1.default.join(target, bundle + '/public'), path_1.default.join(target, 'deploy/prev/' + bundle + '/public'));
    await fs_1.promises.cp(path_1.default.join(projectRoot, bundle + '/public'), path_1.default.join(target, bundle + '/public'), { recursive: true });
}
async function localDeployment(config) {
    const { target } = config;
    console.log('Deploying locally to ' + target);
    // Ensure the main target directories exist:
    await createDirectories(target, ['Api', 'UI/public', 'Admin/public', 'Email/public', 'deploy']);
    // Rotate previous deploys out of the way:
    await rotateDirectories(target);
    // Create the new deploy directories:
    await createDirectories(target, ['deploy/prev', 'deploy/prev/UI', 'deploy/prev/Admin', 'deploy/prev/Email', 'bin/Api/build']);
    // Write new extension config, if there is one:
    if (config.appSettingsExtension) { // (just a json string)
        await writeFile(path_1.default.join(config.projectRoot, 'bin/Api/build/appsettings.extension.json'), config.appSettingsExtension);
    }
    // Move existing API deployment to backup location (if there wasn't one, this can fail safely) and cycle new one in:
    await moveDirectoryIgnoreIfNotFound(path_1.default.join(target, 'Api'), path_1.default.join(target, 'deploy/prev/Api'));
    await fs_1.promises.rename(path_1.default.join(config.projectRoot, 'bin/Api/build'), path_1.default.join(target, 'Api'));
    // Move existing UI/Admin/Email bundle deployments to backup location and copy the new ones in:
    await copyUIBundle(target, config.projectRoot, 'UI');
    await copyUIBundle(target, config.projectRoot, 'Admin');
    await copyUIBundle(target, config.projectRoot, 'Email');
    // Restart the service if one is defined:
    if (config.restartService) {
        console.log('Restarting service called "' + config.restartService + '"');
        await restartService(config.restartService);
    }
}
function restartService(serviceName) {
    return new Promise((s, r) => {
        (0, child_process_1.exec)('service ' + serviceName + ' restart', function (err, stdout, stderr) {
            if (stdout) {
                console.log(stdout);
            }
            if (stderr) {
                console.log(stderr);
            }
            if (err) {
                console.log(err);
                r('Unable to restart service called "' + serviceName + '"');
                return;
            }
            s();
        });
    });
}
exports.default = { localDeployment };
