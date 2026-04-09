// @ts-nocheck
import fs from 'fs';
import https from 'https';
import path from 'path';
import unzip from 'unzipper';
import { getCoreZipPath, getRepoZipPath } from '../versions/helper';
import { jsConfigManager } from '../configManager';
import { ModuleRecord, ModulesJson, ModuleSpec, ModuleJson } from '../types';

const MODULES_JSON_NAME = 'modules.json';

function getModulesJsonPath(projectRoot) {
    return path.join(projectRoot, MODULES_JSON_NAME);
}

export function readModulesJson(projectRoot) {
    const modulesJsonPath = getModulesJsonPath(projectRoot);
    
    if (!fs.existsSync(modulesJsonPath)) {
        return [];
    }
    
    try {
        const content = fs.readFileSync(modulesJsonPath, 'utf8');
        const data = JSON.parse(content);
        return data.modules || [];
    } catch (err) {
        console.log('Warning: modules.json is corrupted, treating as empty');
        return [];
    }
}

export function writeModulesJson(projectRoot, modules) {
    const modulesJsonPath = getModulesJsonPath(projectRoot);
    const data: ModulesJson = { modules };
    fs.writeFileSync(modulesJsonPath, JSON.stringify(data, null, 2));
}

export function getModuleRecord(projectRoot, moduleName) {
    const modules = readModulesJson(projectRoot);
    return modules.find(m => m.module === moduleName);
}

export function recordModule(projectRoot, record: ModuleRecord) {
    const modules = readModulesJson(projectRoot);
    
    const existingIndex = modules.findIndex(m => m.module === record.module);
    if (existingIndex !== -1) {
        modules.splice(existingIndex, 1);
    }
    
    modules.push(record);
    writeModulesJson(projectRoot, modules);
}

export function removeModuleRecord(projectRoot, moduleName) {
    const modules = readModulesJson(projectRoot);
    const filtered = modules.filter(m => m.module !== moduleName);
    writeModulesJson(projectRoot, filtered);
}

export function updateModuleRecord(projectRoot, moduleName, updater: (record: ModuleRecord) => ModuleRecord) {
    const modules = readModulesJson(projectRoot);
    const index = modules.findIndex(m => m.module === moduleName);
    
    if (index === -1) {
        return;
    }
    
    modules[index] = updater(modules[index]);
    writeModulesJson(projectRoot, modules);
}

export function initModulesJson(projectRoot) {
    const modulesJsonPath = getModulesJsonPath(projectRoot);
    if (!fs.existsSync(modulesJsonPath)) {
        writeModulesJson(projectRoot, []);
    }
}

export function readModuleJson(srcDir: string): ModuleJson | null {
    const moduleJsonPath = path.join(srcDir, 'module.json');
    if (!fs.existsSync(moduleJsonPath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(moduleJsonPath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.log('Warning: module.json is corrupted in ' + srcDir);
        return null;
    }
}

async function installModuleDependencies(
    srcDir: string,
    moduleSpecifier: string,
    repository: string,
    projectRoot: string,
    coreDir: string,
    version: string,
    installingSet: Set<string>
): Promise<void> {
    const moduleJson = readModuleJson(srcDir);
    if (!moduleJson || !moduleJson.modules || moduleJson.modules.length === 0) {
        return;
    }

    for (const dep of moduleJson.modules) {
        const depKey = dep.key;

        if (installingSet.has(depKey)) {
            throw new Error(`Circular dependency detected: ${moduleSpecifier} → ${depKey}`);
        }

        const existingRecord = getModuleRecord(projectRoot, depKey);

        if (!existingRecord) {
            installingSet.add(depKey);
            try {
                console.log(`Installing dependency ${depKey} for ${moduleSpecifier}...`);
                const parsed = parseModuleSpec(depKey);
                if (parsed.isModuleSpecifier) {
                    if (repository === CORE_REPO_URL) {
                        await extractCoreModule(parsed.name, coreDir, projectRoot, version, repository, moduleSpecifier, installingSet);
                    } else {
                        const repoDir = await getRepoZipPath(repository, 'main');
                        await extractModuleFromRepo(parsed.name, repoDir, projectRoot, version, repository, moduleSpecifier, installingSet);
                    }
                }
            } catch (err) {
                if (dep.optional) {
                    console.log(`Warning: Optional dependency ${depKey} failed to install - ${err.message}`);
                } else {
                    throw err;
                }
            } finally {
                installingSet.delete(depKey);
            }
        } else {
            if (existingRecord.repository && existingRecord.repository !== repository) {
                throw new Error(`Dependency ${depKey} is installed from a different repository (${existingRecord.repository}) than ${moduleSpecifier} (${repository})`);
            }
        }
    }
}

const CORE_REPO_URL = 'https://github.com/socialstack-core/modules';

function isUrl(spec) {
    return spec.includes('://');
}

function isModuleSpecifier(spec) {
    return /^((UI|Admin|Email|Api)\/)/.test(spec);
}

function isTemplateName(spec) {
    return !isUrl(spec) && !isModuleSpecifier(spec) && spec !== 'none';
}

function resolveRepositoryShortform(shortform: string): string {
    if (!shortform || shortform === 'core') {
        return CORE_REPO_URL;
    }
    if (shortform.includes('://')) {
        return shortform;
    }
    if (shortform.includes('/')) {
        return 'https://github.com/' + shortform;
    }
    return CORE_REPO_URL;
}

export function parseModuleSpec(spec: string): ModuleSpec {
    const parsed: ModuleSpec = {
        spec,
        repository: CORE_REPO_URL,
        explicitRepo: false,
        isUrl: false,
        isTemplate: false,
        isModuleSpecifier: false,
        name: spec
    };

    if (isUrl(spec)) {
        parsed.isUrl = true;
        return parsed;
    }

    const colonIndex = spec.indexOf(':');
    if (colonIndex !== -1) {
        const repoPart = spec.substring(0, colonIndex);
        const namePart = spec.substring(colonIndex + 1);

        if (namePart) {
            parsed.repository = resolveRepositoryShortform(repoPart);
            parsed.explicitRepo = true;
            parsed.name = namePart;
        }
    }

    parsed.isModuleSpecifier = isModuleSpecifier(parsed.name);
    parsed.isTemplate = !parsed.isModuleSpecifier && parsed.name !== 'none';

    return parsed;
}

export function getCoreModulePath(moduleSpecifier) {
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

export function getInstallPath(moduleSpecifier) {
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
            if (entry.name === 'module.json' && src === srcRoot) {
                continue;
            }
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

async function doExtractModule(
    srcDir: string,
    moduleSpecifier: string,
    projectRoot: string,
    version: string,
    repository: string,
    installedByTag: string | undefined,
    coreDir: string,
    installingSet: Set<string>
) {
    const installPath = getInstallPath(moduleSpecifier);
    const destDir = path.join(projectRoot, installPath);
    
    const existingRecord = getModuleRecord(projectRoot, moduleSpecifier);
    if (existingRecord) {
        const fullPath = path.join(projectRoot, existingRecord.path.replace(/\//g, path.sep));
        deleteFolderRecursive(fullPath);
    }
    
    const exclusions = existingRecord?.exclusions || [];
    copyDirRecursive(srcDir, destDir, srcDir, exclusions);
    
    await installModuleDependencies(srcDir, moduleSpecifier, repository, projectRoot, coreDir, version, installingSet);
    
    let installedBy = installedByTag ? [installedByTag] : ['user'];
    if (existingRecord) {
        installedBy = [...existingRecord.installedBy];
        if (installedByTag && !installedBy.includes(installedByTag)) {
            installedBy.push(installedByTag);
        }
        if (!installedBy.includes('user') && !installedByTag) {
            installedBy.push('user');
        }
    }
    
    const record: ModuleRecord = {
        version,
        module: moduleSpecifier,
        path: installPath,
        installedBy,
        exclusions,
        repository: repository && repository !== CORE_REPO_URL ? repository : undefined
    };
    
    recordModule(projectRoot, record);
}

async function extractCoreModule(moduleSpecifier, coreDir, projectRoot, version, repository?: string, installedByTag?: string, installingSet?: Set<string>) {
    const coreModulePath = getCoreModulePath(moduleSpecifier);
    const srcDir = path.join(coreDir, coreModulePath);
    
    if (!fs.existsSync(srcDir)) {
        throw new Error('Module not found in core: ' + moduleSpecifier + ' (looking for ' + coreModulePath + ')');
    }

    const actualInstallingSet = installingSet || new Set<string>();
    actualInstallingSet.add(moduleSpecifier);
    
    const repo = repository || CORE_REPO_URL;
    await doExtractModule(srcDir, moduleSpecifier, projectRoot, version, repo, installedByTag, coreDir, actualInstallingSet);
}

async function extractModuleFromRepo(moduleSpecifier, repoDir, projectRoot, version, repository: string, installedByTag?: string, installingSet?: Set<string>) {
    const coreModulePath = getCoreModulePath(moduleSpecifier);
    const srcDir = path.join(repoDir, coreModulePath);
    
    if (!fs.existsSync(srcDir)) {
        throw new Error('Module not found in repository: ' + moduleSpecifier + ' (looking for ' + coreModulePath + ')');
    }

    const actualInstallingSet = installingSet || new Set<string>();
    actualInstallingSet.add(moduleSpecifier);
    
    await doExtractModule(srcDir, moduleSpecifier, projectRoot, version, repository, installedByTag, repoDir, actualInstallingSet);
}

export async function installModule(spec, projectRoot, coreDir, installedByOverride?: string[], installingSet?: Set<string>) {
    initModulesJson(projectRoot);
    
    const appsettingsPath = path.join(projectRoot, 'appsettings.json');
    const appsettings = new jsConfigManager(appsettingsPath).get();
    const version = appsettings.CoreVersion || 'unknown';
    
    const parsed = parseModuleSpec(spec);
    
    if (parsed.isUrl) {
        console.log('Installing module from URL: ' + spec);
        await downloadAndExtractZip(parsed.spec, projectRoot);
    } else if (parsed.isModuleSpecifier) {
        console.log('Installing module: ' + parsed.name);
        const actualInstallingSet = installingSet || new Set<string>();
        if (parsed.repository === CORE_REPO_URL) {
            await extractCoreModule(parsed.name, coreDir, projectRoot, version, undefined, undefined, actualInstallingSet);
        } else {
            const repoDir = await getRepoZipPath(parsed.repository, 'main');
            await extractModuleFromRepo(parsed.name, repoDir, projectRoot, version, parsed.repository, undefined, actualInstallingSet);
        }
    } else if (parsed.isTemplate) {
        console.log('Installing template: ' + parsed.name);
        await installTemplate(parsed.name, projectRoot, coreDir, parsed.repository, parsed.explicitRepo);
    } else {
        throw new Error('Unknown module format: ' + spec);
    }
}

export async function installTemplate(templateName, projectRoot, coreDir, sourceRepository?: string, sourceExplicitRepo?: boolean) {
    const parsed = parseModuleSpec(templateName);
    const templateSpec = parsed.name;
    
    if (!isTemplateName(templateSpec)) {
        throw new Error('Invalid template name: ' + templateSpec);
    }

    const effectiveRepo = sourceRepository || CORE_REPO_URL;
    const effectiveExplicitRepo = sourceExplicitRepo ?? false;

    console.log('Loading template: ' + templateSpec);
    let templatePath: string;
    
    if (effectiveRepo === CORE_REPO_URL) {
        templatePath = path.join(coreDir, 'Templates', templateSpec, 'package.json');
    } else {
        const repoDir = await getRepoZipPath(effectiveRepo, 'main');
        templatePath = path.join(repoDir, 'Templates', templateSpec, 'package.json');
    }
    
    if (!fs.existsSync(templatePath)) {
        throw new Error('Template not found: ' + templateSpec);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = JSON.parse(templateContent);

    if (template.dependencies && template.dependencies.length > 0) {
        console.log('Installing modules from template...');
        for (const dep of template.dependencies) {
            try {
                await installModuleFromTemplate(dep, projectRoot, coreDir, templateSpec, effectiveRepo, effectiveExplicitRepo);
            } catch (err) {
                console.log('Warning: ' + (err.message || err));
            }
        }
    }
}

async function installModuleFromTemplate(spec, projectRoot, coreDir, templateName, defaultRepository?: string, defaultExplicitRepo?: boolean) {
    initModulesJson(projectRoot);
    
    const appsettingsPath = path.join(projectRoot, 'appsettings.json');
    const appsettings = new jsConfigManager(appsettingsPath).get();
    const version = appsettings.CoreVersion || 'unknown';
    const installedByTag = 'template:' + templateName;
    
    const parsed = parseModuleSpec(spec);
    
    let repository: string;
    let explicitRepo: boolean;
    
    if (parsed.explicitRepo) {
        repository = parsed.repository;
        explicitRepo = true;
    } else if (defaultExplicitRepo) {
        repository = defaultRepository || CORE_REPO_URL;
        explicitRepo = false;
    } else {
        repository = defaultRepository || CORE_REPO_URL;
        explicitRepo = false;
    }
    
    if (parsed.isUrl) {
        console.log('Installing module from URL: ' + spec);
        await downloadAndExtractZip(parsed.spec, projectRoot);
    } else if (parsed.isModuleSpecifier) {
        console.log('Installing module: ' + parsed.name);
        if (repository === CORE_REPO_URL) {
            await extractCoreModule(parsed.name, coreDir, projectRoot, version, undefined, installedByTag);
        } else {
            const repoDir = await getRepoZipPath(repository, 'main');
            await extractModuleFromRepo(parsed.name, repoDir, projectRoot, version, repository, installedByTag);
        }
    } else {
        await installTemplate(parsed.name, projectRoot, coreDir, repository, explicitRepo);
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

export function uninstallModules(modules, config) {
    return new Promise((success, reject) => {
        var projectRoot = path.normalize(config.projectRoot);
        initModulesJson(projectRoot);

        modules.forEach(module => {
            const record = getModuleRecord(projectRoot, module);
            
            if (!record) {
                console.log("Can't uninstall '" + module + "' - not found in modules.json");
                return;
            }
            
            var fullPath = projectRoot + '/' + record.path;

            if (!deleteFolderRecursive(fullPath)) {
                console.log("Can't uninstall '" + module + "' because it doesn't exist in this project (skipping)");
            }
            
            removeModuleRecord(projectRoot, module);
        });

        success();
    });
}

export function uninstallTemplate(templateName, config) {
    return new Promise((success, reject) => {
        var projectRoot = path.normalize(config.projectRoot);
        initModulesJson(projectRoot);
        
        const installedByTag = 'template:' + templateName;
        const modules = readModulesJson(projectRoot);
        
        for (const record of modules) {
            if (record.installedBy.includes(installedByTag)) {
                if (record.installedBy.includes('user')) {
                    console.log(`Skipping ${record.module} - also explicitly installed by user`);
                    updateModuleRecord(projectRoot, record.module, (r) => ({
                        ...r,
                        installedBy: r.installedBy.filter(tag => tag !== installedByTag)
                    }));
                } else {
                    const fullPath = projectRoot + '/' + record.path;
                    deleteFolderRecursive(fullPath);
                    removeModuleRecord(projectRoot, record.module);
                }
            }
        }
        
        success();
    });
}

export { installModules, getCoreZipPathForInstall };
