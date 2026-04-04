import { SocialStackConfig, ModuleRecord } from '../types';
import fs from 'fs';
import path from 'path';
import { readModulesJson, updateModuleRecord, removeModuleRecord } from '../install/helpers';

function removeThirdParty(fullPath: string): string {
    return fullPath.replace('/ThirdParty/', '/');
}

function findContainingModule(projectRoot: string, targetPath: string): ModuleRecord | null {
    const modules = readModulesJson(projectRoot);
    const parts = targetPath.split('/');
    
    if (parts.length < 2) {
        return null;
    }
    
    for (let i = 2; i <= parts.length; i++) {
        const candidate = parts.slice(0, i).join('/');
        const lastPart = parts[i - 1];
        
        if (lastPart.includes('.')) {
            continue;
        }
        
        const match = modules.find(m => m.module === candidate);
        if (match) {
            return match;
        }
    }
    
    return null;
}

function isFilePath(relativePath: string): boolean {
    return relativePath.includes('.');
}

async function moveItem(targetPath: string, projectRoot: string) {
    const module = findContainingModule(projectRoot, targetPath);
    
    if (!module) {
        console.log("No matching installed modules found.");
        return;
    }
    
    if (targetPath === module.module) {
        const sourcePath = path.join(projectRoot, module.path.replace(/\//g, path.sep));
        const destPath = path.join(projectRoot, removeThirdParty(module.path).replace(/\//g, path.sep));
        
        if (!fs.existsSync(sourcePath)) {
            console.log('Error: Source module directory not found at ' + module.path);
            return;
        }
        
        if (fs.existsSync(destPath)) {
            console.log('Error: Destination path already exists at ' + removeThirdParty(module.path));
            return;
        }
        
        fs.renameSync(sourcePath, destPath);
        removeModuleRecord(projectRoot, module.module);
        console.log("Successfully moved thirdparty module to firstparty.");
        return;
    }
    
    const relativePath = targetPath.substring(module.module.length + 1);
    const sourcePath = path.join(projectRoot, module.path.replace(/\//g, path.sep), relativePath.replace(/\//g, path.sep));
    const sourceFullPath = path.join(projectRoot, module.path.replace(/\//g, path.sep), relativePath.replace(/\//g, path.sep));
    const destFullPath = path.join(projectRoot, removeThirdParty(module.path).replace(/\//g, path.sep), relativePath.replace(/\//g, path.sep));
    
    if (!fs.existsSync(sourceFullPath)) {
        console.log('Error: Source file/directory not found at ' + sourcePath);
        return;
    }
    
    if (fs.existsSync(destFullPath)) {
        console.log('Error: Destination path already exists at ' + removeThirdParty(module.path) + '/' + relativePath);
        return;
    }
    
    const destDir = path.dirname(destFullPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.renameSync(sourceFullPath, destFullPath);
    
    if (!module.exclusions.includes(relativePath)) {
        updateModuleRecord(projectRoot, module.module, (record) => ({
            ...record,
            exclusions: [...record.exclusions, relativePath]
        }));
    }
    
    if (isFilePath(relativePath)) {
        console.log("File moved to firstparty successfully.");
    } else {
        console.log("Directory moved to firstparty successfully.");
    }
}

export const run = async (config: SocialStackConfig) => {
    const targetPath = config.commandLine['-']?.[0];
    
    if (!targetPath) {
        console.log("Please specify a path to move. Like this: 'socialstack move UI/HelloWorld/File.tsx'");
        return;
    }
    
    try {
        await moveItem(targetPath, config.projectRoot);
    } catch (err: any) {
        console.log('Error: ' + (err.message || err));
    }
};
