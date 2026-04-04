import { SocialStackConfig, ModuleRecord } from '../types';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
    readModulesJson,
    updateModuleRecord,
    getModuleRecord,
    initModulesJson,
    getInstallPath,
    getCoreModulePath
} from '../install/helpers';
import { getLatestCoreBranch, parseCalver, compareCalver, getCoreZipPath } from '../versions/helper';

function deleteFolderRecursive(dirPath) {
    if (!dirPath || dirPath === '/') {
        return false;
    }
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file, index) => {
            const curPath = path.join(dirPath, file);
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

function shouldSkipPath(entryName: string, currentSrc: string, srcRoot: string, exclusions: string[]): boolean {
    const relativePath = path.relative(srcRoot, path.join(currentSrc, entryName)).replace(/\\/g, '/');
    return exclusions.some(excl => 
        relativePath === excl || relativePath.startsWith(excl + '/')
    );
}

function copyDirRecursive(src, dest, srcRoot = src, exclusions: string[] = []) {
    if (!fs.existsSync(src)) {
        return;
    }

    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (shouldSkipPath(entry.name, src, srcRoot, exclusions)) {
            continue;
        }

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, srcRoot, exclusions);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function checkForUpdate(record: ModuleRecord): Promise<{ current: string; latest: string } | null> {
    if (record.repository) {
        return null;
    }

    const latestBranch = await getLatestCoreBranch();
    if (!latestBranch) {
        return null;
    }

    const latestVersion = latestBranch.replace('core-', '');
    const comparison = compareCalver(parseCalver(record.version), parseCalver(latestVersion));

    if (comparison < 0) {
        return { current: record.version, latest: latestVersion };
    }

    return null;
}

async function upgradeModule(record: ModuleRecord, newVersion: string, projectRoot: string) {
    initModulesJson(projectRoot);

    const coreBranch = 'core-' + newVersion;
    const coreDir = await getCoreZipPath(coreBranch);
    const coreModulePath = getCoreModulePath(record.module);
    const srcDir = path.join(coreDir, coreModulePath);

    if (!fs.existsSync(srcDir)) {
        throw new Error('Module not found in core: ' + record.module);
    }

    const fullPath = path.join(projectRoot, record.path.replace(/\//g, path.sep));
    deleteFolderRecursive(fullPath);

    const installPath = getInstallPath(record.module);
    const destDir = path.join(projectRoot, installPath);
    copyDirRecursive(srcDir, destDir, srcDir, record.exclusions || []);

    updateModuleRecord(projectRoot, record.module, (r) => ({
        ...r,
        version: newVersion,
        path: installPath
    }));

    console.log(`Upgraded ${record.module} from ${record.version} to ${newVersion}`);
}

function updateCoreVersion(projectRoot: string, modules: ModuleRecord[]) {
    const coreModules = modules.filter(m => !m.repository);
    if (coreModules.length === 0) return;

    let lowest = coreModules[0];
    for (const m of coreModules) {
        if (compareCalver(parseCalver(m.version), parseCalver(lowest.version)) < 0) {
            lowest = m;
        }
    }

    const appsettingsPath = path.join(projectRoot, 'appsettings.json');
    const appsettings = JSON.parse(fs.readFileSync(appsettingsPath, 'utf8'));
    appsettings.CoreVersion = lowest.version;
    fs.writeFileSync(appsettingsPath, JSON.stringify(appsettings, null, 2));

    console.log(`Updated CoreVersion to ${lowest.version}`);
}

function askConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(message + ' (y/N) ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

export const run = async (config: SocialStackConfig) => {
    const modulesArg = config.commandLine['-'] || [];
    const isAll = config.commandLine.all;
    const isYes = config.commandLine.yes;
    const isDryRun = config.commandLine.dryRun;

    if (modulesArg.length === 0 && !isAll) {
        console.log("Error: Please specify modules to upgrade or use --all");
        console.log("Usage: socialstack upgrade UI/HelloWorld [modules...]");
        console.log("Usage: socialstack upgrade --all");
        return;
    }

    const projectRoot = config.projectRoot;
    const modules = readModulesJson(projectRoot);

    let modulesToUpgrade: ModuleRecord[];
    if (isAll) {
        modulesToUpgrade = modules;
    } else {
        modulesToUpgrade = modules.filter(m => modulesArg.includes(m.module));
        const notFound = modulesArg.filter(arg => !modules.find(m => m.module === arg));
        if (notFound.length > 0) {
            console.log("Warning: These modules are not in modules.json: " + notFound.join(', '));
        }
    }

    if (modulesToUpgrade.length === 0) {
        console.log("No modules to upgrade.");
        return;
    }

    console.log("Checking for updates...");
    const upgrades: { record: ModuleRecord; newVersion: string }[] = [];

    for (const record of modulesToUpgrade) {
        const update = await checkForUpdate(record);
        if (update) {
            upgrades.push({ record, newVersion: update.latest });
        }
    }

    if (upgrades.length === 0) {
        console.log("All specified modules are up to date.");
        return;
    }

    console.log("Upgrades available:");
    for (const { record, newVersion } of upgrades) {
        console.log(`  ${record.module}: ${record.version} -> ${newVersion}`);
    }

    if (isDryRun) {
        console.log("\nDry run - no changes made.");
        return;
    }

    if (!isYes) {
        const confirmed = await askConfirm("Proceed with upgrade?");
        if (!confirmed) {
            console.log("Upgrade cancelled.");
            return;
        }
    }

    console.log("");
    for (const { record, newVersion } of upgrades) {
        try {
            await upgradeModule(record, newVersion, projectRoot);
        } catch (err: any) {
            console.log(`Failed to upgrade ${record.module}: ${err.message || err}`);
        }
    }

    const updatedModules = readModulesJson(projectRoot);
    updateCoreVersion(projectRoot, updatedModules);

    console.log("\nUpgrade complete.");
};
