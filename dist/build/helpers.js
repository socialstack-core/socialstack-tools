"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const child_process_1 = require("child_process");
const configManager_1 = __importDefault(require("../configManager"));
const { jsConfigManager } = configManager_1.default;
const builder_1 = __importDefault(require("../builder"));
function updateIndex(publicUrl, fileInfo, publicDir, config) {
    updateHtmlFile(publicUrl, fileInfo, publicDir, config, 'index.html', false);
    updateHtmlFile(publicUrl, fileInfo, publicDir, config, 'mobile.html', true);
}
function updateHtmlFile(publicUrl, fileInfo, publicDir, config, htmlFileName, optional) {
    // First try to read the .html file:
    var fullFilePath = publicDir + '/' + htmlFileName;
    fs_1.default.readFile(fullFilePath, 'utf8', function (err, contents) {
        if (err || !contents || !contents.length) {
            // Doesn't exist or otherwise isn't readable.
            if (!optional) {
                console.log('Info: Error when trying to read ' + htmlFileName + ': ', err);
            }
            return;
        }
        var originalContents = contents;
        var time = Date.now() + '';
        // For each file, find publicUrl + the name in contents and append ?v=... on it, where v is simply the timestamp of when this ran.
        fileInfo.files.forEach(file => {
            var fileName = path_1.default.basename(file.path);
            var filePublicPath = publicUrl + fileName;
            // This is looking for, for example, /en-admin/pack/main.generated.js?v=1.
            // It'll replace that number on the end with the current time.
            var fileRegex = new RegExp((filePublicPath + "?v=").replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([0-9]+)', 'g');
            contents = contents.replace(fileRegex, filePublicPath + '?v=' + time);
        });
        if (originalContents != contents && contents.length) {
            // Write it back out:
            fs_1.default.writeFile(fullFilePath, contents, function (err) {
                err && console.error(err);
            });
        }
        // Precompress if needed:
        if (config.compress) {
            fs_1.default.writeFileSync(fullFilePath + '.gz', zlib_1.default.gzipSync(contents));
        }
        else {
            fs_1.default.unlink(fullFilePath + '.gz', function () { });
        }
    });
}
/*
* Called after the CSS has gone through SASS.
* Its job is to add any prefixes automatically.
*/
function processCss(cssFile, config) {
    if (!config.__postCss) {
        // Disabled.
        return Promise.resolve(cssFile);
    }
    return config.__postCss.process(cssFile, { from: undefined }).then(result => {
        result.warnings().forEach(warn => {
            console.warn(warn.toString());
        });
        return result.css;
    });
}
function getCustomBuildConfig(path) {
    // Straight try to read the .json file:
    var appsettingsManager = new jsConfigManager(path + "/package.json");
    var packageJson = appsettingsManager.get();
    return packageJson && packageJson.scripts && packageJson.scripts.build;
}
function generateAliases(map) {
    var aliases = 'export = {\r\n';
    var entrypoint = 'global.__mm = {\r\n';
    for (var k in map.modules) {
        // If this file is the "root" of a module, create an alias for it.
        var mod = map.modules[k];
        var modFilePath;
        var pathPieces = mod.parentModule.split('/');
        var lastPiece = pathPieces[pathPieces.length - 1];
        // E.g. "UI" or "Admin"
        var primaryBundle = pathPieces[0];
        // Skip files directly in the primary bundle directory. This is, e.g. UI/entrypoint.js and UI/aliases.js:
        if (k.split('/').length <= 2) {
            continue;
        }
        if (mod.isThirdParty) {
            modFilePath = primaryBundle + "/Source/ThirdParty" + k.substring(primaryBundle.length);
        }
        else {
            modFilePath = primaryBundle + "/Source" + k.substring(primaryBundle.length);
        }
        var fPathPieces = modFilePath.split('/');
        var lastFPiece = fPathPieces[fPathPieces.length - 1];
        if (lastFPiece == lastPiece + '.js' || lastFPiece == lastPiece + '.jsx' || lastFPiece == lastPiece + '.ts' || lastFPiece == lastPiece + '.tsx') {
            aliases += '"' + mod.parentModule + '$": "' + modFilePath + '",\r\n';
            entrypoint += '"' + mod.parentModule + '/' + lastFPiece + '": dynamicModule1,\r\n';
        }
        else {
            aliases += '"' + mod.parentModule + '/' + lastFPiece + '$": "' + modFilePath + '",\r\n';
        }
    }
    // console.log(aliases + '};');
    // console.log(entrypoint + '};\r\nstart();');
}
function watchOrBuild(config, isWatch) {
    // Site UI:
    var sourceDir = config.projectRoot + '/UI/Source';
    var publicDir = config.projectRoot + '/UI/public';
    var outputDir = publicDir + '/pack/';
    var moduleName = 'UI';
    // If either a package.json exists in projectRoot or the UI folder, check if it contains a custom build cmd.
    // If it does, reject the request unless config.force is true.
    if (!config.force && (getCustomBuildConfig(config.projectRoot) || getCustomBuildConfig(config.projectRoot + '/UI'))) {
        console.log('Note: UI build/ watch was not started because the project has custom build configuration. See the project readme or ask the project owner for how the UI should be built. This happens because the project has a package.json with a "build" script in it. You can force this build to proceed anyway with -force.');
        return Promise.resolve(true);
    }
    if (!fs_1.default.existsSync(sourceDir)) {
        console.log('Note: We\'re running with a prebuilt UI. This is a normal mode and happens because your "UI/Source" directory doesn\'t exist. If this isn\'t intentional and you\'d like to be able to runtime update your UI modules, we tried to find it here - make sure this exists: ' + sourceDir);
        return Promise.resolve(true);
    }
    // Ask for a modular build for 3 bundles:
    return builder_1.default.modular.build({
        cacheDir: config.noCache ? undefined : config.projectRoot + '/obj',
        bundles: ["UI", "Admin", "Email"],
        projectRoot: config.projectRoot,
        minified: config.minified
    });
}
function buildAll(opts, config) {
    opts = opts || {};
    var promises = [];
    config.minified = (opts.prod || opts.minified) ? true : false;
    config.compress = (opts.prod || opts.compress) ? true : false;
    config.bundled = (opts.bundled) ? true : false;
    if (!opts.noUi) {
        // Build UI:
        promises.push(watchOrBuild(config, false));
    }
    if (!opts.noApi) {
        // Build API:
        promises.push(buildAPI(config));
    }
    if (!opts.noApp) {
        // Build cordova app (if there is one):
    }
    return Promise.all(promises);
}
function buildUI(config, isWatch) {
    if (config.commandLine.relativePaths) {
        config.relativePaths = true;
    }
    if (config.commandLine.old || config.commandLine.bundled) {
        config.bundled = true;
    }
    if (config.commandLine.baseUrl) {
        config.baseUrl = Array.isArray(config.commandLine.baseUrl) ? config.commandLine.baseUrl[0] : config.commandLine.baseUrl;
    }
    config.minified = (config.commandLine.prod || config.commandLine.minified) ? true : false;
    config.compress = (config.commandLine.prod || config.commandLine.compress) ? true : false;
    return watchOrBuild(config, isWatch);
}
function buildAPI(config) {
    // Output into bin/Api/build by default (unless told otherwise)
    return new Promise((success, reject) => {
        //  dotnet publish Api.csproj -o obj/tm
        const child = (0, child_process_1.spawn)('dotnet', ['publish', 'Api.csproj', '-o', 'bin/Api/build', '-c', 'Release', '/bl:sstools-build.binlog'], {
            cwd: config.projectRoot
        });
        // Change encoding to text:
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            // data from standard output is here as buffers
            console.log(chunk);
        });
        // since these are streams, you can pipe them elsewhere
        child.stderr.on('data', (chunk) => {
            // data from standard output is here as buffers
            console.log(chunk);
        });
        child.on('close', (code) => {
            if (!code) {
                console.log('API build success');
                success();
            }
            else {
                reject('API build failed. See above for more details.');
            }
        });
    });
}
exports.default = { buildAPI, buildUI, buildAll, watchOrBuild };
