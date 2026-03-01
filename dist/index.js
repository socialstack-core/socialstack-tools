"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = __importDefault(require("./configManager/index.js"));
const { setLocalConfig, localConfigPath } = index_js_1.default;
const helpers_js_1 = __importDefault(require("./projectHelpers/helpers.js"));
const { findProjectRoot, isProjectRoot } = helpers_js_1.default;
const commander_1 = require("commander");
const package_json_1 = __importDefault(require("../package.json"));
// Commands
const helpers_js_2 = __importDefault(require("./build/helpers.js"));
const { buildUI, buildAPI, buildAll, watchOrBuild } = helpers_js_2.default;
const app_js_1 = __importDefault(require("./build/app.js"));
const { buildApp } = app_js_1.default;
const git_js_1 = __importDefault(require("./build/git.js"));
const { gitSync } = git_js_1.default;
const localDeployment_js_1 = __importDefault(require("./build/localDeployment.js"));
const { localDeployment } = localDeployment_js_1.default;
const tests_js_1 = __importDefault(require("./build/tests.js"));
const { runTests } = tests_js_1.default;
const getContentTypeId_js_1 = __importDefault(require("./getContentTypeId.js"));
const index_js_2 = __importDefault(require("./generate/index.js"));
const sync_js_1 = __importDefault(require("./sync/sync.js"));
const index_js_3 = __importDefault(require("./host/index.js"));
const deploy_js_1 = __importDefault(require("./deploy/deploy.js"));
const upgrade_js_1 = __importDefault(require("./upgrade/upgrade.js"));
const contribute_js_1 = __importDefault(require("./contribute/contribute.js"));
const index_js_4 = __importDefault(require("./init/index.js"));
const index_js_5 = __importDefault(require("./create/index.js"));
const index_js_6 = __importDefault(require("./add/index.js"));
const index_js_7 = __importDefault(require("./install/index.js"));
const index_js_8 = __importDefault(require("./uninstall/index.js"));
const index_js_9 = __importDefault(require("./repository/index.js"));
const index_js_10 = __importDefault(require("./interactive/index.js"));
exports.default = (config) => {
    const program = new commander_1.Command();
    program
        .name('socialstack')
        .description(package_json_1.default.description)
        .version(package_json_1.default.version, '-v, --version, version', 'outputs the currently installed version of SocialStack tools');
    // Helper to ensure we are in a project folder before running
    const withProject = (fn) => {
        return (...args) => {
            findProjectRoot(config, (result) => {
                if (!result && program.args[0] !== 'buildapp') {
                    console.error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI or an Api directory to be a project.');
                    return;
                }
                fn(...args);
            });
        };
    };
    program
        .command('buildui')
        .description('builds UI/Source and Admin/Source, then quits.')
        .option('--prod', 'Minify and pre-gzip the UI builds for you')
        .option('--force', 'Force internal build chain')
        .option('--noCache', 'Disabled build cache')
        .action(withProject((options) => {
        if (options.force)
            config.force = true;
        if (options.prod)
            config.minified = true;
        if (options.noCache)
            config.noCache = true;
        buildUI(config, false).then(() => {
            console.log("Build success");
        }).catch((e) => {
            console.log("Build failed\n", e);
            process.exit(1);
        });
    }));
    program
        .command('buildapp')
        .description('builds a Cordova native app.')
        .requiredOption('--apiUrl <url>', 'The API location the built app will use')
        .requiredOption('--instanceUrl <url>', 'The instance used to generate all localised JS files')
        .action(withProject((options) => {
        config.apiUrl = options.apiUrl;
        config.instanceUrl = options.instanceUrl;
        buildApp(config).then(() => {
            console.log("Build success");
        }).catch((e) => {
            console.log("Build failed\n", e);
            process.exit(1);
        });
    }));
    program
        .command('buildapi')
        .description('a convenience build command (defaults to outputting into Api/Build).')
        .action(withProject((options) => {
        buildAPI(config).catch((e) => {
            console.log("Build failed");
            process.exit(1);
        });
    }));
    program
        .command('build')
        .alias('b')
        .description('builds the UI, API and optionally native apps with Cordova.')
        .option('--prod', 'minify and pre-gzip the UI builds for you')
        .option('--force', 'Force internal build chain')
        .option('--noUI', 'Skip UI')
        .option('--noApi', 'Skip API')
        .option('--noApp', 'Skip App')
        .option('--branch <branch>', 'Git branch to sync before build')
        .option('--localDeploy <dir>', 'Local deploy target directory')
        .option('--appSettingsExtension <ext>', 'App settings extension to use for local deploy')
        .option('--restartService <service>', 'Service name to restart after local deploy')
        .option('--test', 'Run dotnet tests')
        .action(withProject((options) => {
        if (options.prod) {
            config.minified = true;
            config.compress = true;
        }
        if (options.force)
            config.force = true;
        let preBuild = [];
        if (options.branch) {
            preBuild.push(gitSync(options.branch, config.calledFromPath));
        }
        Promise.all(preBuild)
            .then(() => buildAll({
            prod: config.minified,
            compress: config.compress,
            noUi: options.noUI,
            noApi: options.noApi,
            noApp: options.noApp
        }, config))
            .then(() => {
            if (options.localDeploy) {
                return localDeployment({
                    target: options.localDeploy,
                    projectRoot: config.projectRoot,
                    appSettingsExtension: options.appSettingsExtension,
                    restartService: options.restartService,
                });
            }
        })
            .then(() => {
            if (options.test) {
                return runTests({ projectRoot: config.projectRoot, csProject: 'Tests/Tests.csproj' });
            }
        })
            .catch((e) => {
            console.error(e);
            console.log("Build failed");
            process.exit(1);
        });
    }));
    program
        .command('id [contentTypes...]')
        .description('Provide the content type names you\'d like the ID for')
        .action((contentTypes) => {
        if (!contentTypes || !contentTypes.length) {
            console.log("Provide the content type names you'd like the ID for. For example, 'socialstack id User'");
            return;
        }
        contentTypes.forEach(type => console.log(type + ': ' + (0, getContentTypeId_js_1.default)(type)));
    });
    program
        .command('version')
        .alias('v')
        .description('outputs the currently installed version of SocialStack tools')
        .action(() => console.log(package_json_1.default.version));
    program
        .command('generate')
        .alias('g')
        .description('creates a new module.')
        .action(withProject(() => (0, index_js_2.default)(config)));
    program
        .command('sync')
        .description('Sync module')
        .action(withProject(() => (0, sync_js_1.default)(config)));
    program
        .command('where')
        .description('outputs the project directory')
        .action(withProject(() => console.log(config.projectRoot)));
    program
        .command('host')
        .description('Host config to define target servers for simple deploys')
        .action(() => (0, index_js_3.default)(config));
    program
        .command('deploy')
        .description('Deploys a project over SSH')
        .action(withProject(() => (0, deploy_js_1.default)(config)));
    program
        .command('upgrade')
        .description('Upgrades a project / modules')
        .action(withProject(() => (0, upgrade_js_1.default)(config)));
    program
        .command('contribute')
        .alias('push')
        .alias('p')
        .description('Scans your thirdparty module directories for changes you\'ve made and contributes them')
        .action(withProject(() => (0, contribute_js_1.default)(config)));
    program
        .command('configuration')
        .description('returns the location of the configuration file for socialstack tools')
        .action(() => console.log(localConfigPath()));
    program
        .command('configure')
        .description('Configure socialstack tools database settings')
        .option('-u <user>', 'Username', 'root')
        .option('-p <password>', 'Password')
        .option('-s <server>', 'Server', 'localhost')
        .action((options) => {
        setLocalConfig({
            databases: {
                local: {
                    username: options.u,
                    password: options.p,
                    server: options.s
                }
            }
        }).then(() => console.log('Socialstack tools configured'));
    });
    program
        .command('init')
        .description('creates a database for the current project')
        .action(withProject(() => (0, index_js_4.default)(config)));
    program
        .command('create')
        .alias('c')
        .description('creates a new blank SocialStack project in your working directory')
        .option('--dbMode <mode>', 'DB Mode')
        .action((options) => {
        findProjectRoot(config, (result) => {
            if (result && options.dbMode !== 'continue') {
                console.log('There\'s already a socialstack project in your working directory - doing nothing.');
            }
            else {
                (0, index_js_5.default)(config);
            }
        });
    });
    program
        .command('add')
        .alias('share')
        .alias('a')
        .alias('s')
        .description('Pushes *this directory* up to the source repository for global publishing.')
        .option('-d <desc>', 'A description of the module')
        .action(withProject((options) => {
        if (options.d)
            config.commandLine = { command: 'add', d: [options.d] };
        (0, index_js_6.default)(config);
    }));
    program
        .command('install [modules...]')
        .alias('i')
        .description('install the named module(s) from any repositories you have configured')
        .action(withProject((modules) => {
        config.commandLine = { command: 'install', '-': modules };
        (0, index_js_7.default)(config);
    }));
    program
        .command('uninstall [modules...]')
        .alias('u')
        .description('remove the named module(s)')
        .action(withProject((modules) => {
        config.commandLine = { command: 'uninstall', '-': modules };
        (0, index_js_8.default)(config);
    }));
    program
        .command('repository')
        .description('Repository commands')
        .action(() => (0, index_js_9.default)(config));
    program
        .command('interactive')
        .description('Interactive mode. We\'ll send and receive data over stdio.')
        .option('-p <p>', 'Obsolete usage of socialstack tools')
        .option('--parent <parent>', 'Old usage of socialstack tools detected')
        .option('--lockfile <file>', 'Lockfile location')
        .action(withProject((options) => {
        if (options.p) {
            console.error('Obsolete usage of socialstack tools. Upgrade the Api/StackTools module in this project to continue using this version of socialstack tools.');
            return;
        }
        if (options.parent) {
            console.error('[NOTE] Old usage of socialstack tools detected. Upgrade the Api/StackTools module in this project to prevent stray node.js processes being created on forced quits. Proceeding anyway.');
        }
        if (options.lockfile) {
            config.lockfile = options.lockfile;
        }
        config.onRequest = function (message) {
            var action = message.request.action;
            if (action == "watch") {
                config.minified = message.request.prod || message.request.minified;
                config.compress = message.request.prod || message.request.compress;
                config.bundled = true;
                watchOrBuild(config, true);
                message.response({ success: true });
            }
            else {
                message.response({ unknown: action });
            }
        };
        (0, index_js_10.default)(config);
    }));
    program.on('command:*', function () {
        console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
        process.exit(1);
    });
    if (config.commandLine && config.commandLine.loadCommandLine && process.argv.length <= 2) {
        config.commandLine = { command: 'watch', '-': [] };
        findProjectRoot(config, (result) => {
            if (!result) {
                console.error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI or an Api directory to be a project.');
                return;
            }
        });
    }
    if (!config.commandLine)
        config.commandLine = { command: 'watch', '-': [] };
    program.parse(process.argv);
};
