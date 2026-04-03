import { SocialStackConfig } from '../types';
import fs from 'fs';
import https from 'https';
import path from 'path';
import unzip from 'unzipper';
import { getLatestCoreBranch, getOrCacheVersionZip } from '../versions/helper';
import { exec as exec } from 'child_process';

const skipPrefixes = [
    'UI/Source/',
    'Admin/Source/',
    'Email/Source/',
    'Api/',
    'Templates/'
];

function isUrl(spec: string): boolean {
    return spec.includes('://');
}

function isModuleSpecifier(spec: string): boolean {
    return /^((UI|Admin|Email|Api)\/)/.test(spec);
}

function getCorePath(moduleSpecifier: string): string {
    if (moduleSpecifier.startsWith('UI/')) {
        return 'UI/Source/' + moduleSpecifier.substring(3);
    }
    if (moduleSpecifier.startsWith('Admin/')) {
        return 'Admin/Source/' + moduleSpecifier.substring(6);
    }
    if (moduleSpecifier.startsWith('Email/')) {
        return 'Email/Source/' + moduleSpecifier.substring(6);
    }
    return moduleSpecifier;
}

function mkDirByPathSync(targetDir: string) {
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

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

function loadTemplateFromUrl(url: string): Promise<{ dependencies: string[] }> {
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

function copyDirRecursive(src: string, dest: string) {
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

export const run = async (config: SocialStackConfig) => {
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

    let rootPrefix: string | null = null;
    const tempExtractDir = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'socialstack-')), 'extracted');

    await new Promise<void>((resolve, reject) => {
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
        } catch {}
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
    let template: { dependencies: string[] };

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

        const coreExtractDir = tempExtractDir;

        for (const dep of template.dependencies) {
            if (isUrl(dep)) {
                console.log('Installing module from URL: ' + dep);
                await installModuleFromZipUrl(dep);
            } else if (isModuleSpecifier(dep)) {
                console.log('Installing module: ' + dep);
                const corePath = getCorePath(dep);
                const srcDir = path.join(coreExtractDir, corePath);
                if (fs.existsSync(srcDir)) {
                    copyDirRecursive(srcDir, process.cwd());
                } else {
                    console.log('Warning: Module not found in core: ' + dep + ' (looking for ' + corePath + ')');
                }
            } else {
                console.log('Warning: Unknown dependency format: ' + dep);
            }
        }
    }

    console.log('Complete! You can now run the project with "dotnet run" or start it with your favourite IDE.');
};

async function installModuleFromZipUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        https.get(url, function(response) {
            if (response.statusCode !== 200 || response.headers['content-type'] !== 'application/zip') {
                reject(new Error('Invalid response from: ' + url));
                return;
            }

            const tempZipPath = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'socialstack-module-')), 'module.zip');
            const writeStream = fs.createWriteStream(tempZipPath);

            response.pipe(writeStream);

            writeStream.on('finish', () => {
                const extractDir = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'socialstack-module-extract-')), 'extracted');

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
                    .on('close', () => {
                        const entries = fs.readdirSync(extractDir);
                        for (const entry of entries) {
                            const srcPath = path.join(extractDir, entry);
                            const destPath = path.join(process.cwd(), entry);
                            if (fs.lstatSync(srcPath).isDirectory()) {
                                copyDirRecursive(srcPath, destPath);
                            } else {
                                fs.copyFileSync(srcPath, destPath);
                            }
                        }

                        fs.rmSync(path.dirname(tempZipPath), { recursive: true, force: true });
                        fs.rmSync(extractDir, { recursive: true, force: true });
                        resolve();
                    })
                    .on('error', reject);
            });

            writeStream.on('error', reject);
        }).on('error', reject);
    });
}
