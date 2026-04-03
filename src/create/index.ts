import { SocialStackConfig } from '../types';
import fs from 'fs';
import https from 'https';
import path from 'path';
import unzip from 'unzipper';
import { getLatestCoreBranch, getOrCacheVersionZip } from '../versions/helper';
import { installModule, getCoreZipPathForInstall } from '../install/helpers';
import { exec as exec } from 'child_process';

const skipPrefixes = [
    'UI/Source/',
    'Admin/Source/',
    'Email/Source/',
    'Api/',
    'Templates/'
];

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

    console.log('Complete! You can now run the project with "dotnet run" or start it with your favourite IDE.');
};
