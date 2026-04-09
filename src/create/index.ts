import { SocialStackConfig } from '../types';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { getLatestCoreBranch, getCoreZipPath } from '../versions/helper';
import { installModule, installModules, getCoreZipPathForInstall, initModulesJson } from '../install/helpers';
import { setupDatabaseFromAppsettings } from '../database/helpers';
import { exec as exec } from 'child_process';

const skipPrefixes = [
    'UI/Source/',
    'Admin/Source/',
    'Email/Source/',
    'Api/',
    'Templates/',
    'ModuleTemplates/'
];

const databaseEngineMap: Record<string, string | null> = {
    'none': null,
    'mysql': 'Api/DatabaseMySQL',
    'maria': 'Api/DatabaseMySQL',
    'mariadb': 'Api/DatabaseMySQL',
    'mongo': 'Api/DatabaseMongoDB',
    'mongodb': 'Api/DatabaseMongoDB',
};

const defaultDatabaseEngine = 'mongo';

function getDatabaseModule(engine: string): string | null {
    const normalized = engine.toLowerCase();
    return databaseEngineMap[normalized] || null;
}

function getProjectIdentifier(projectRoot: string) {
    const dirName = path.basename(projectRoot);
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return {
        dirName,
        schemaName: `${dirName}_${day}-${month}-${year}`,
    };
}

function generatePassword(length = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function isUrl(spec) {
    return spec.includes('://');
}

function mkDirByPathSync(targetDir) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = '.';
    targetDir.split(sep).reduce((parentDir, childDir) => {
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

function copyDirRecursiveSkippingModules(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const srcPathNormalized = srcPath.replace(/\\/g, '/');

        let shouldSkip = false;
        for (const prefix of skipPrefixes) {
            const normalizedPrefix = prefix.replace(/\\/g, '/');
            if (entry.name === normalizedPrefix.replace(/\/$/, '') || srcPathNormalized.includes('/' + normalizedPrefix.replace(/\/$/, '') + '/') || srcPathNormalized.endsWith('/' + normalizedPrefix.replace(/\/$/, ''))) {
                shouldSkip = true;
                break;
            }
        }

        if (shouldSkip) {
            continue;
        }

        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDirRecursiveSkippingModules(srcPath, destPath);
        } else {
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function loadTemplateFromUrl(url) {
    return new Promise((success, reject) => {
        https.get(url, function(res) {
            const bodyResponse: Buffer[] = [];
            res.on('data', (d) => bodyResponse.push(Buffer.from(d)));
            res.on('end', () => {
                const jsonResp = Buffer.concat(bodyResponse).toString('utf8');
                try {
                    success(JSON.parse(jsonResp));
                } catch (e) {
                    reject(new Error('Invalid JSON in template URL: ' + url));
                }
            });
        }).on('error', reject);
    });
}

export const run = async (config) => {
    try {
    const projectRoot = config.calledFromPath;

    console.log('Creating a new SocialStack project in ' + projectRoot + '...');

    const templateName = config.createOptions?.template || 'standard';

    console.log('Finding latest SocialStack core version...');
    const latestBranch = await getLatestCoreBranch();
    if (!latestBranch) {
        throw new Error('No core-* branch found in the repository');
    }

    const coreVersion = latestBranch.replace('core-', '');
    console.log('Latest version: ' + coreVersion);

    console.log('Extracting core files...');
    const coreExtractDir = await getCoreZipPath(latestBranch);

    console.log('Copying core files to project (skipping module directories)...');
    copyDirRecursiveSkippingModules(coreExtractDir, projectRoot);

    console.log('Creating module directories...');
    ['UI/Source', 'Admin/Source', 'Email/Source', 'Api'].forEach(dir => {
        fs.mkdirSync(path.join(projectRoot, dir), { recursive: true });
    });

    console.log('Updating appsettings.json...');
    const appsettingsPath = path.join(projectRoot, 'appsettings.json');
    let appsettings: Record<string, any> = {};
    if (fs.existsSync(appsettingsPath)) {
        try {
            appsettings = JSON.parse(fs.readFileSync(appsettingsPath, 'utf8'));
        } catch (e) {}
    }
    appsettings.CoreVersion = coreVersion;
    fs.writeFileSync(appsettingsPath, JSON.stringify(appsettings, null, 2));

    console.log('Initializing modules.json...');
    initModulesJson(projectRoot);

    console.log('Initializing git repository...');
    await new Promise<void>((resolve, reject) => {
        exec('git init', { cwd: projectRoot }, (err, stdout, stderr) => {
            if (err) {
                console.log('Warning: git init failed:', err.message);
            }
            resolve();
        });
    });

    console.log('Processing template: ' + templateName);

    if (templateName !== 'none') {
        const coreDir = await getCoreZipPathForInstall(projectRoot);

        if (isUrl(templateName)) {
            console.log('Loading template from URL...');
            const template: { dependencies?: string[] } = await loadTemplateFromUrl(templateName);
            if (template.dependencies && template.dependencies.length > 0) {
                console.log('Installing modules from template...');
                for (const dep of template.dependencies) {
                    try {
                        await installModule(dep, projectRoot, coreDir);
                    } catch (err) {
                        console.log('Warning: ' + (err.message || err));
                    }
                }
            }
        } else {
            console.log('Installing template: ' + templateName);
            await installModules([templateName], projectRoot);
        }
    }

    const databaseEngine = config.createOptions?.database || defaultDatabaseEngine;
	
	// Remove any default config from the project itself:
	delete appsettings.MongoConnectionStrings;
	delete appsettings.ConnectionStrings;
	
    if (databaseEngine !== 'none') {
        const dbModule = getDatabaseModule(databaseEngine);
        const coreDir = await getCoreZipPathForInstall(projectRoot);
        const projectId = getProjectIdentifier(projectRoot);

        if (dbModule) {
            console.log('Installing database module: ' + dbModule);
            try {
                await installModule(dbModule, projectRoot, coreDir);
            } catch (err) {
                console.log('Warning: Failed to install database module: ' + (err.message || err));
            }
        }
		
        if (databaseEngine === 'mongo' || databaseEngine === 'mongodb') {
            appsettings.MongoConnectionStrings = {
                DefaultConnection: `mongodb://localhost:27017/${projectId.schemaName}?ssl=false`
            };
        } else if (databaseEngine === 'mysql' || databaseEngine === 'maria' || databaseEngine === 'mariadb') {
            const password = generatePassword();
            const userName = projectId.schemaName + '_u';
            appsettings.ConnectionStrings = {
                DefaultConnection: `server=localhost;port=3306;AllowPublicKeyRetrieval=true;database=${projectId.schemaName};user=${userName};password=${password}`
            };
        }

        fs.writeFileSync(appsettingsPath, JSON.stringify(appsettings, null, 2));

        console.log('Setting up database...');
        try {
            await setupDatabaseFromAppsettings(projectRoot);
        } catch (err) {
            console.log('Warning: ' + (err.message || err));
        }
    } else {
        console.log('No database configured. Project will run in in-memory mode.');
    }

    console.log('Installing npm dependencies...');
    await new Promise<void>((resolve, reject) => {
        exec('npm i', { cwd: projectRoot }, (err, stdout, stderr) => {
            if (err) {
                console.log('Warning: npm install failed:', err.message);
            }
            resolve();
        });
    });

    console.log('Complete! You can now run the project with "dotnet run" or start it with your favourite IDE.');
    } catch (err) {
        console.error('Error:', err.message || err);
    }
};
