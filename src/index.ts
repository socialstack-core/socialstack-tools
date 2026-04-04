

import fs from 'fs';
import path from 'path';

import { SocialStackConfig } from './types';
import { setLocalConfig, localConfigPath } from './configManager/index.js';
import { findProjectRoot, isProjectRoot } from './projectHelpers/helpers.js';
import { Command } from 'commander';
import pkg from '../package.json';
import { buildUI, buildAPI, buildAll, watchOrBuild } from './build/helpers.js';
import { buildApp } from './build/app.js';
import { gitSync } from './build/git.js';
import { localDeployment } from './build/localDeployment.js';
import { runTests } from './build/tests.js';
import { run as mod_generate } from './generate/index.js';
import { run as mod_host } from './host/index.js';
import { run as mod_deploy } from './deploy/deploy.js';
import { run as mod_init } from './init/index.js';
import { run as mod_create } from './create/index.js';
import { run as mod_install } from './install/index.js';
import { run as mod_uninstall } from './uninstall/index.js';
import { run as mod_move } from './move/index.js';
import { run as mod_upgrade } from './upgrade/index.js';

// Commands

export const run = (config: SocialStackConfig) => {
    const program = new Command();

    program
        .name('socialstack')
        .description(pkg.description)
        .version(pkg.version, '-v, --version, version', 'outputs the currently installed version of SocialStack tools');

    // Helper to ensure we are in a project folder before running
    const withProject = (fn: any) => {
        return (...args: any[]) => {
            findProjectRoot(config, (result: any) => {
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
        .action(withProject((options: any) => {
            if (options.force) config.force = true;
            if (options.prod) config.minified = true;
            if (options.noCache) config.noCache = true;

            buildUI(config, false).then(() => {
                console.log("Build success");
            }).catch((e: any) => {
                console.log("Build failed\n", e);
                process.exit(1);
            });
        }));

    program
        .command('buildapp')
        .description('builds a Cordova native app.')
        .requiredOption('--apiUrl <url>', 'The API location the built app will use')
        .requiredOption('--instanceUrl <url>', 'The instance used to generate all localised JS files')
        .action(withProject((options: any) => {
            config.apiUrl = options.apiUrl;
            config.instanceUrl = options.instanceUrl;

            buildApp(config).then(() => {
                console.log("Build success");
            }).catch((e: any) => {
                console.log("Build failed\n", e);
                process.exit(1);
            });
        }));

    program
        .command('buildapi')
        .description('a convenience build command (defaults to outputting into Api/Build).')
        .action(withProject((options: any) => {
            buildAPI(config).catch((e: any) => {
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
        .action(withProject((options: any) => {
            if (options.prod) {
                config.minified = true;
                config.compress = true;
            }
            if (options.force) config.force = true;

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
                .catch((e: any) => {
                    console.error(e);
                    console.log("Build failed");
                    process.exit(1);
                });
        }));

    program
        .command('version')
        .alias('v')
        .description('outputs the currently installed version of SocialStack tools')
        .option('--project', 'Get the CoreVersion from the project appsettings.json')
        .action((options: any) => {
            if (options.project) {
                findProjectRoot(config, (result: any) => {
                    if (!result || !config.projectRoot) {
                        console.log('unknown');
                        return;
                    }
                    const appSettingsPath = path.join(config.projectRoot, 'appsettings.json');
                    try {
                        if (!fs.existsSync(appSettingsPath)) {
                            console.log('unknown');
                            return;
                        }
                        const appSettings = JSON.parse(fs.readFileSync(appSettingsPath, 'utf-8'));
                        const coreVersion = appSettings.CoreVersion;
                        if (coreVersion === undefined || coreVersion === null) {
                            console.log('unknown');
                        } else {
                            console.log(coreVersion);
                        }
                    } catch (e) {
                        console.log('unknown');
                    }
                });
            } else {
                console.log(pkg.version);
            }
        });

    program
        .command('generate [modules...]')
        .alias('g')
        .description('creates a new module.')
        .action(withProject((modules: string[]) => {
            config.commandLine = { command: 'generate', '-': modules };
            mod_generate(config);
        }));

    program
        .command('where')
        .description('outputs the project directory')
        .action(withProject(() => console.log(config.projectRoot)));

    program
        .command('host')
        .description('Host config to define target servers for simple deploys')
        .action(() => mod_host(config));

    program
        .command('deploy')
        .description('Deploys a project over SSH')
        .action(withProject(() => mod_deploy(config)));

    program
        .command('configuration')
        .description('returns the location of the configuration file for socialstack tools')
        .action(() => console.log(localConfigPath()));

    program
        .command('configure')
        .description('Configure socialstack tools MySQL database settings')
        .option('-u <user>', 'Username', 'root')
        .option('-p <password>', 'Password')
        .option('-s <server>', 'Server', 'localhost')
        .action((options: any) => {
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
        .action(withProject(() => mod_init(config)));

    program
        .command('create')
        .alias('c')
        .description('creates a new blank SocialStack project in your working directory')
        .option('--template <name-or-url>', 'Template to use: none, standard, or URL (default: standard)')
        .option('--database <engine>', 'Database engine to install: none, mysql, mongo (default: mongo)')
        .action((options) => {
            config.createOptions = options;
            mod_create(config);
        });

    program
        .command('install [modules...]')
        .alias('i')
        .description('install the named module(s) from any repositories you have configured')
        .action(withProject((modules: string[]) => {
            config.commandLine = { command: 'install', '-': modules };
            mod_install(config);
        }));

    program
        .command('uninstall [modules...]')
        .alias('u')
        .description('remove the named module(s)')
        .action(withProject((modules: string[]) => {
            config.commandLine = { command: 'uninstall', '-': modules };
            mod_uninstall(config);
        }));

    program
        .command('move <path>')
        .description('move a file, directory or entire module from thirdparty to firstparty')
        .action(withProject((targetPath: string) => {
            config.commandLine = { command: 'move', '-': [targetPath] };
            mod_move(config);
        }));

    program
        .command('upgrade [modules...]')
        .description('upgrade module(s) to their latest versions')
        .option('--all', 'Upgrade all installed modules')
        .option('--yes', 'Skip confirmation prompt')
        .option('--dryRun', 'Show what would be upgraded without making changes')
        .action(withProject((modules: string[], options: any) => {
            config.commandLine = {
                command: 'upgrade',
                '-': modules,
                all: options.all,
                yes: options.yes,
                dryRun: options.dryRun
            };
            mod_upgrade(config);
        }));

    program.on('command:*', function () {
        console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
        process.exit(1);
    });

    if (config.commandLine && config.commandLine.loadCommandLine && process.argv.length <= 2) {
        config.commandLine = { command: 'watch', '-': [] };
        findProjectRoot(config, (result: any) => {
            if (!result) {
                console.error('Your current working path is not a socialstack project: ' + config.calledFromPath + '. It must contain at least a UI or an Api directory to be a project.');
                return;
            }
        });
    }

    if (!config.commandLine) config.commandLine = { command: 'watch', '-': [] };

    program.parse(process.argv);
};