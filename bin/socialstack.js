#!/usr/bin/env node

var process = require('process');
var path = require('path');

// The working dir where we were invoked:
var calledFromPath = process.cwd();

// Change to the socialstack tools directory:
process.chdir(path.dirname(__filename) + '/../');

require('../index.js')({
	loadCommandLine: true,
	calledFromPath
});
