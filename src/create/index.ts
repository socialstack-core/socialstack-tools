import { SocialStackConfig } from '../types';
import fs from 'fs';
import https from 'https';
import path from 'path';
import unzip from 'unzipper';
import { getLatestCoreBranch, getOrCacheVersionZip } from '../versions/helper';
import { installModule, getCoreZipPathForInstall } from '../install/helpers';
import { setupDatabaseFromAppsettings } from '../database/helpers';
import { exec as exec } from 'child_process';

const skipPrefixes = [
    'UI/Source/',
    'Admin/Source/',
    'Email/Source/',
    'Api/',
    'Templates/'
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

function getProjectIdentifier() {
    const dirName = path.basename(process.cwd());
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

function loadTemplateFromUrl(url) {
    return new Promise((success, reject) => {
        https.get(url, function(res) {
            const bodyResponse = [];
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
    console.log('Creating a new SocialStack project...');

    const templateName = config.createOptions?.template || 'standard';

    console.log('Finding latest SocialStack core version...');
    const latestBranch = await getLatestCoreBranch();
    if (!latestBranch) {
        throw new Error('No core-* branch found in the repository');
    }

    const coreVersion = latestBranch.replace('core-', '');
    console.log('Latest version: ' + coreVersion);

    console.log('Downloading core...');
    const zipStream = await getOrCacheVersionZip(latestBranch);

    console.log('Extracting core files (skipping module directories)...');

    let rootPrefix = null;
    const tempExtractDir = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'socialstack-')), 'extracted');

    await new Promise((resolve, reject) => {
        zipStream.pipe(unzip.Parse())
            .on('entry', (entry) => {
                const entryPath = entry.path;

                if (rootPrefix === null) {
                    const parts = entryPath.split('/');
                    if (parts.length > 1) {
                        rootPrefix = parts[0] + '/';
                    } else {
                        rootPrefix = '';
                    }
                }

                const relativePath = entryPath.substring(rootPrefix.length);

                if (relativePath === '' || relativePath.endsWith('/')) {
                    entry.autodrain();
                    return;
                }

                let shouldSkip = false;
                for (const prefix of skipPrefixes) {
                    if (relativePath.startsWith(prefix)) {
                        shouldSkip = true;
                        break;
                    }
                }

                if (shouldSkip) {
                    entry.autodrain();
                    return;
                }

                const destPath = path.join(tempExtractDir, relativePath);
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

    const entries = fs.readdirSync(tempExtractDir);
    for (const entry of entries) {
        const srcPath = path.join(tempExtractDir, entry);
        const destPath = path.join(process.cwd(), entry);
        if (fs.lstatSync(srcPath).isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }

    fs.rmSync(tempExtractDir, { recursive: true, force: true });

    console.log('Creating module directories...');
    ['UI/Source', 'Admin/Source', 'Email/Source', 'Api'].forEach(dir => {
        fs.mkdirSync(dir, { recursive: true });
    });

    console.log('Updating appsettings.json...');
    const appsettingsPath = path.join(process.cwd(), 'appsettings.json');
    let appsettings: Record<string, any> = {};
    if (fs.existsSync(appsettingsPath)) {
        try {
            appsettings = JSON.parse(fs.readFileSync(appsettingsPath, 'utf8'));
        } catch (e) {}
    }
    appsettings.CoreVersion = coreVersion;
    fs.writeFileSync(appsettingsPath, JSON.stringify(appsettings, null, 2));

    console.log('Initializing git repository...');
    await new Promise<void>((resolve, reject) => {
        exec('git init', { cwd: process.cwd() }, (err, stdout, stderr) => {
            if (err) {
                console.log('Warning: git init failed:', err.message);
            }
            resolve();
        });
    });

    console.log('Processing template: ' + templateName);
    let template;

    if (isUrl(templateName)) {
        console.log('Loading template from URL...');
        template = await loadTemplateFromUrl(templateName);
    } else {
        console.log('Loading template: ' + templateName);
        const templatePath = path.join(tempExtractDir, 'Templates', templateName + '.json');
        if (!fs.existsSync(templatePath)) {
            throw new Error('Template not found: ' + templatePath);
        }
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        template = JSON.parse(templateContent);
    }

    if (template.dependencies && template.dependencies.length > 0) {
        console.log('Installing modules from template...');

        const coreDir = await getCoreZipPathForInstall(process.cwd());

        for (const dep of template.dependencies) {
            try {
                await installModule(dep, process.cwd(), coreDir);
            } catch (err) {
                console.log('Warning: ' + (err.message || err));
            }
        }
    }

    const databaseEngine = config.createOptions?.database || defaultDatabaseEngine;

    if (databaseEngine !== 'none') {
        const dbModule = getDatabaseModule(databaseEngine);
        const coreDir = await getCoreZipPathForInstall(process.cwd());
        const projectId = getProjectIdentifier();

        if (dbModule) {
            console.log('Installing database module: ' + dbModule);
            try {
                await installModule(dbModule, process.cwd(), coreDir);
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
                DefaultConnection: `server=localhost;port=3306;SslMode=none;AllowPublicKeyRetrieval=true;database=${projectId.schemaName};user=${userName};password=${password}`
            };
        }

        fs.writeFileSync(appsettingsPath, JSON.stringify(appsettings, null, 2));

        console.log('Setting up database...');
        try {
            await setupDatabaseFromAppsettings(process.cwd());
        } catch (err) {
            console.log('Warning: ' + (err.message || err));
        }
    } else {
        console.log('No database configured. Project will run in in-memory mode.');
    }

    console.log('Complete! You can now run the project with "dotnet run" or start it with your favourite IDE.');
};
