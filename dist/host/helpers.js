"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ssh2_1 = __importDefault(require("ssh2"));
const configManager_1 = __importDefault(require("../configManager"));
const { jsConfigManager } = configManager_1.default;
const helpers_js_1 = __importDefault(require("../install/helpers.js"));
const { mkDirByPathSync } = helpers_js_1.default;
const fs_2 = __importDefault(require("fs"));
/*
* Walks the given filesystem.
* The resulting file set is relative to the target directory.
*/
function walk(dir, done) {
    var results = [];
    fs_1.default.readdir(dir, function (err, list) {
        if (err)
            return done(err);
        var pending = list.length;
        if (!pending)
            return done(null, results);
        list.forEach(function (file) {
            file = path_1.default.resolve(dir, file);
            fs_1.default.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    walk(file, function (err, res) {
                        results = results.concat(res);
                        if (!--pending)
                            done(null, results);
                    });
                }
                else {
                    results.push(file);
                    if (!--pending)
                        done(null, results);
                }
            });
        });
    });
}
;
/*
* Lists all hosts (optionally filtered by a given directory).
*/
function listHosts(optionalInDirectory) {
    return new Promise((success, reject) => {
        var settingsPath = getHostsConfigDir();
        var relTo = optionalInDirectory || '';
        if (relTo && relTo.length) {
            relTo = path_1.default.sep + relTo;
        }
        walk(settingsPath + relTo, (err, files) => {
            if (err) {
                return success([]);
            }
            var relativeFiles = [];
            files = files.forEach(file => {
                var relativePath = path_1.default.relative(settingsPath, file);
                if (relativePath.endsWith('.json')) {
                    relativeFiles.push(relativePath);
                }
            });
            var hosts = relativeFiles.map(file => {
                // Always using unix path sep style:
                return {
                    file,
                    name: file.substring(0, file.length - 5).replace('\\', '/')
                };
            });
            success(hosts);
        });
    });
}
/*
* Adds a new host to the cache.
*/
function addHost(hostCfg) {
    return new Promise((success, reject) => {
        var { address, user, key, password, hostName, remoteDir, force, environment } = hostCfg;
        if (!address) {
            throw new Error('address {IP or DNS address} is required.');
        }
        if (!user) {
            throw new Error('user {SSH user} is required.');
        }
        if (!key && !password) {
            throw new Error('key {SSH key filepath} or p {password} is required. Use a key when possible.');
        }
        if (!hostName) {
            // Use the address as the name:
            hostName = address;
        }
        else {
            hostName = hostName[0].trim();
        }
        if (!hostName || (!key && !password) || !user || !address) {
            throw new Error('-key or -p, -user and -addr are required.');
        }
        // Check if hostname is alphanumeric:
        if (!hostName.match(/^[0-9a-zA-Z\.\-\/\\]+$/)) {
            throw new Error('The name used to identify this host must be alphanumeric but can contain / if you want to group them. "socialstack host -a niceHostName -addr ...". Tried to use: ' + hostName);
        }
        var targetFile = getHostsConfigDir() + hostName + '.json';
        fs_1.default.stat(targetFile, (err, stat) => {
            if (!err) {
                // It already exists.
                if (!force) {
                    return success({
                        unchanged: true,
                        path: targetFile
                    });
                }
            }
            var hostInfo = {
                name: hostName,
                address,
                user,
                keyPath: key ? path_1.default.resolve(key) : undefined,
                password,
                remoteDir: remoteDir || '/var/www',
                environment: environment || ''
            };
            // Make the dir if it's needed:
            mkDirByPathSync(path_1.default.dirname(targetFile));
            fs_1.default.writeFile(targetFile, JSON.stringify(hostInfo, null, 2), () => {
                // Added:
                success({
                    path: targetFile
                });
            });
        });
    });
}
function getAppSettings(config) {
    if (!config.projectRoot) {
        return null;
    }
    if (config.loadedAppSettings) {
        return config.loadedAppSettings;
    }
    var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
    var appsettings = appsettingsManager.get();
    config.loadedAppSettings = appsettings;
    var publicUrl = appsettings.PublicUrl;
    if (!publicUrl) {
        return null;
    }
    var protoParts = publicUrl.split('://');
    if (protoParts.length > 1) {
        publicUrl = protoParts[1];
    }
    publicUrl = publicUrl.replace(/\//gi, '');
    if (appsettings.serviceName === undefined) {
        appsettings.serviceName = publicUrl;
    }
    appsettings.siteBasename = publicUrl;
    return appsettings;
}
/*
* Gets a host by its name (optionally incl. directory).
*/
function getHost(name) {
    return new Promise((success, reject) => {
        if (name.address) {
            // It's already a host object - do nothing:
            return success(name);
        }
        var hostName = name.replace(/\\/gi, '/').trim();
        var targetFile = getHostsConfigDir() + hostName + '.json';
        fs_1.default.readFile(targetFile, { encoding: 'utf8' }, (err, result) => {
            if (err) {
                return reject('Host does not exist (Tried to find it in ' + targetFile + ')');
            }
            // Parse it:
            var host = null;
            try {
                host = JSON.parse(result);
            }
            catch (e) {
                return reject('JSON parse failure in ' + targetFile + '. The error was: ' + e);
            }
            success(host);
        });
    });
}
/*
* Attempts to connect to a host.
*/
function connect(nameOrInfo) {
    var Client = ssh2_1.default.Client;
    return getHost(nameOrInfo)
        .then(host => {
        return new Promise((success, rej) => {
            var conn = new Client();
            conn.hostInfo = host;
            conn.on('ready', function () {
                success(conn);
            });
            conn.on('error', function (e) {
                rej(e);
            });
            conn.connect({
                host: host.address,
                port: 22,
                username: host.user,
                password: host.password || undefined,
                privateKey: host.keyPath ? fs_2.default.readFileSync(host.keyPath) : undefined
            });
        });
    });
}
/*
* Filesystem path to the hosts config directory.
*/
function getHostsConfigDir() {
    if (_hostConfigDir) {
        return _hostConfigDir;
    }
    // Get path to socialstack tools internal cfg:
    import adp from 'appdata-path';
    ('socialstack');
    return _hostConfigDir = appdata_path_1.default + path_1.default.sep + 'hosts' + path_1.default.sep;
}
var _hostConfigDir = null;
exports.default = {
    walk,
    getHostsConfigDir,
    addHost,
    listHosts,
    connect,
    getAppSettings
};
