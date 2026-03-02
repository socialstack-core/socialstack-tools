#!/usr/bin/env node

const process = require('process');
const path = require('path');

const calledFromPath = process.cwd();
const scriptDir = path.dirname(require.main.filename);

const projectRoot = path.resolve(scriptDir, '..');
process.chdir(projectRoot);

const distPath = path.resolve(projectRoot, 'dist', 'index.js');

const indexModule = require(distPath);
indexModule.run({
	loadCommandLine: true,
	calledFromPath
});
