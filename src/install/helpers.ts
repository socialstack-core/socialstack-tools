// @ts-nocheck
import fs from 'fs';
import https from 'https';
import path from 'path';
import unzip from 'unzipper';
import { getCoreZipPath } from '../versions/helper';
import { jsConfigManager } from '../configManager';

function isUrl(spec) {
    return spec.includes('://');
}

function isModuleSpecifier(spec) {
    return /^((UI|Admin|Email|Api)\/)/.test(spec);
}

function getCoreModulePath(moduleSpecifier) {
    if (moduleSpecifier.startsWith('UI/')) {
        return 'UI/Source/' + moduleSpecifier.substring(3);
    }
    if (moduleSpecifier.startsWith('Admin/')) {
        return 'Admin/Source/' + moduleSpecifier.substring(6);
    }
    if (moduleSpecifier.startsWith('Email/')) {
        return 'Email/Source/' + moduleSpecifier.substring(6);
    }
    if (moduleSpecifier.startsWith('Api/')) {
        return 'Api/' + moduleSpecifier.substring(4);
    }
    return moduleSpecifier;
}

function getInstallPath(moduleSpecifier) {
    if (moduleSpecifier.startsWith('UI/')) {
        return 'UI/Source/ThirdParty/' + moduleSpecifier.substring(3);
    }
    if (moduleSpecifier.startsWith('Admin/')) {
        return 'Admin/Source/ThirdParty/' + moduleSpecifier.substring(6);
    }
    if (moduleSpecifier.startsWith('Email/')) {
        return 'Email/Source/ThirdParty/' + moduleSpecifier.substring(6);
    }
    if (moduleSpecifier.startsWith('Api/')) {
        return 'Api/ThirdParty/' + moduleSpecifier.substring(4);
    }
    return moduleSpecifier;
}

function mkDirByPathSync(targetDir) {
    const sep = path.sep;
    targetDir = targetDir.replace(/\//gi, sep).replace(/\\/gi, sep);
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = '.';
    return targetDir.split(sep).reduce((parentDir, childDir) => {
        const curDir = path.resolve(baseDir, parentDir, childDir);
        try {
            fs.mkdirSync(curDir);
        } catch (err) {
            if (err.code === 'EEXIST') {
                return curDir;
            }
        }
        return curDir;
    }, initDir);
}

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }

    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function downloadAndExtractZip(url, projectRoot) {
    const tempZipPath = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'socialstack-module-')), 'module.zip');
    const extractDir = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'socialstack-module-extract-')), 'extracted');

    await new Promise((resolve, reject) => {
        https.get(url, function(response) {
            if (response.statusCode !== 200) {
                reject(new Error('Download failed with status: ' + response.statusCode));
                return;
            }

            const writeStream = fs.createWriteStream(tempZipPath);
            response.pipe(writeStream);

            writeStream.on('finish', () => {
                fs.createReadStream(tempZipPath)
                    .pipe(unzip.Parse())
                    .on('entry', (entry) => {
                        const entryPath = entry.path;

                        if (entry.type === 'Directory' || entryPath === '' || entryPath.endsWith('/')) {
                            entry.autodrain();
                            return;
                        }

                        const destPath = path.join(extractDir, entryPath);
                        mkDirByPathSync(path.dirname(destPath));

                        if (entry.type === 'File') {
                            entry.pipe(fs.createWriteStream(destPath));
                        } else {
                            entry.autodrain();
                        }
                    })
                    .on('close', resolve)
                    .on('error', reject);
            });

            writeStream.on('error', reject);
        }).on('error', reject);
    });

    const entries = fs.readdirSync(extractDir);
    for (const entry of entries) {
        const srcPath = path.join(extractDir, entry);
        const destPath = path.join(projectRoot, entry);
        if (fs.lstatSync(srcPath).isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }

    fs.rmSync(path.dirname(tempZipPath), { recursive: true, force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
}

async function extractCoreModule(moduleSpecifier, coreDir, projectRoot) {
    const coreModulePath = getCoreModulePath(moduleSpecifier);
    const srcDir = path.join(coreDir, coreModulePath);
    
    if (!fs.existsSync(srcDir)) {
        throw new Error('Module not found in core: ' + moduleSpecifier + ' (looking for ' + coreModulePath + ')');
    }

    const installPath = getInstallPath(moduleSpecifier);
    const destDir = path.join(projectRoot, installPath);
    copyDirRecursive(srcDir, destDir);
}

async function installModule(spec, projectRoot, coreDir) {
    if (isUrl(spec)) {
        console.log('Installing module from URL: ' + spec);
        await downloadAndExtractZip(spec, projectRoot);
    } else if (isModuleSpecifier(spec)) {
        console.log('Installing module: ' + spec);
        await extractCoreModule(spec, coreDir, projectRoot);
    } else {
        throw new Error('Unknown module format: ' + spec);
    }
}

function getCoreZipPathForInstall(projectRoot) {
    const appsettingsPath = path.join(projectRoot, 'appsettings.json');
    const appsettings = new jsConfigManager(appsettingsPath).get();

    if (!appsettings.CoreVersion) {
        throw new Error('CoreVersion is required in appsettings.json for the install command. Run "socialstack create" first.');
    }

    const coreBranch = 'core-' + appsettings.CoreVersion;
    return getCoreZipPath(coreBranch);
}

async function installModules(modules, projectRoot) {
    if (!modules || !modules.length) {
        throw new Error('No module names specified');
    }

    console.log('Loading core version...');
    const coreDir = await getCoreZipPathForInstall(projectRoot);

    for (const moduleSpec of modules) {
        try {
            await installModule(moduleSpec, projectRoot, coreDir);
        } catch (err) {
            console.log('Warning: ' + (err.message || err));
        }
    }
}

function deleteFolderRecursive(dirPath) {
    if (!dirPath || dirPath == '/') {
        return false;
    }
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file, index) => {
            var curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
        return true;
    }
    return false;
}

function getModuleFilePath(moduleName) {
    var moduleFilePath = moduleName.replace(/\./gi, '/').replace(/\\/gi, '/');

    if (moduleFilePath.toLowerCase().indexOf('ui/') == 0) {
        moduleFilePath = 'UI/Source/' + moduleFilePath.substring(3);
    } else if (moduleFilePath.toLowerCase().indexOf('admin/') == 0) {
        moduleFilePath = 'Admin/Source/' + moduleFilePath.substring(6);
    } else if (moduleFilePath.toLowerCase().indexOf('email/') == 0) {
        moduleFilePath = 'Email/Source/' + moduleFilePath.substring(6);
    } else if (moduleFilePath.toLowerCase().indexOf('api/') == 0) {
        moduleFilePath = 'Api/' + moduleFilePath.substring(4);
    }

    return moduleFilePath;
}

function uninstallModules(modules, config) {
    return new Promise((success, reject) => {
        var projectRoot = path.normalize(config.projectRoot);

        modules.forEach(module => {
            var modulePath = getModuleFilePath(module);
            var fullPath = projectRoot + '/' + modulePath;

            if (!deleteFolderRecursive(fullPath)) {
                console.log("Can't uninstall '" + module + "' because it doesn't exist in this project (skipping)");
            }
        });

        success();
    });
}

export { installModule, installModules, getCoreZipPathForInstall, uninstallModules };
