// @ts-nocheck

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { SocialStackConfig } from '../types';
import { deleteFolderRecursive } from '../install/helpers.js';

/*
* The sections which can be culled. Each defines where its ThirdParty components live,
* how a component becomes importable, and whether dot notation (C# namespaces) is used.
*/
const sections = {
	'api': {
		thirdPartyPath: ['Api', 'ThirdParty'],
		importPrefix: 'Api',
		api: true,
		dotNotation: true
	},
	'ui': {
		thirdPartyPath: ['UI', 'Source', 'ThirdParty'],
		importPrefix: 'UI',
		api: false,
		dotNotation: false
	},
	'email': {
		thirdPartyPath: ['Email', 'Source', 'ThirdParty'],
		importPrefix: 'Email',
		api: false,
		dotNotation: false
	}
};

// Directory names which are never searched for references (build output, source control, etc).
const excludedDirectoryNames = ['.git', 'node_modules', 'bin', 'obj', 'Logs', 'public', '.vs', '.vscode'];

// Specific file names which are never searched for references.
// modules.json and the generated TypeScript path mapping are generated manifests,
// so they only record which modules have been installed (not an indication of usage).
const excludedFileNames = ['modules.json', 'tsconfig.generated.json'];

// File types which indicate a directory contains a component (UI/Email sections).
const componentSourceExtensions = ['js', 'jsx', 'ts', 'tsx', 'scss', 'css'];

// Never attempt to read binary-ish files when searching for references.
const ignoredFileExtensions = [
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif',
	'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'mkv',
	'woff', 'woff2', 'ttf', 'otf', 'eot',
	'zip', 'gz', 'tar', '7z', 'rar', 'zipx',
	'dll', 'exe', 'pdb', 'obj', 'bin', 'dat', 'db', 'gzip', 'dump',
	'bak', 'log', 'binlog'
];

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
* Walks the given directory (recursively) collecting files which could contain references.
* Skipped directories are ignored entirely. Binary-ish files are skipped by extension.
* Returns [{relPath, content}] where relPath is forward slash based and absolute.
*/
function collectTextFiles(dirPath, results) {
	var entries;
	try {
		entries = fs.readdirSync(dirPath);
	} catch (e) {
		return;
	}

	entries.forEach(name => {
		var curPath = path.join(dirPath, name);
		var stats;
		try {
			stats = fs.lstatSync(curPath);
		} catch (e) {
			return;
		}

		if (stats.isDirectory()) {
			if (excludedDirectoryNames.indexOf(name.toLowerCase()) != -1) {
				return;
			}
			collectTextFiles(curPath, results);
			return;
		}

		if (!stats.isFile()) {
			return;
		}

		if (excludedFileNames.indexOf(name.toLowerCase()) != -1) {
			return;
		}

		var extIndex = name.lastIndexOf('.');
		var ext = extIndex == -1 ? '' : name.substring(extIndex + 1).toLowerCase();

		if (ignoredFileExtensions.indexOf(ext) != -1) {
			return;
		}

		if (stats.size > 10 * 1024 * 1024) {
			// Skip very large files.
			return;
		}

		var content;
		try {
			content = fs.readFileSync(curPath, 'utf8');
		} catch (e) {
			return;
		}

		// Rough binary check:
		if (content.indexOf('\0') != -1) {
			return;
		}

		results.push({
			relPath: curPath.replace(/\\/gi, '/'),
			content
		});
	});
}

/*
* Returns true if the given directory contains at least one stylesheet and no script files.
* Such components exist purely to contribute global styles (their SCSS is automatically
* bundled) and are never referenced by import path, e.g. Bootstrap, font packs, icon sets.
*/
function directoryIsStylesOnly(directoryPath) {
	var state = { style: false, scanResult: undefined };

	var classify = (dirPath) => {
		var entries;
		try {
			entries = fs.readdirSync(dirPath);
		} catch (e) {
			return;
		}

		entries.forEach(name => {
			var curPath = path.join(dirPath, name);
			var stats;
			try {
				stats = fs.lstatSync(curPath);
			} catch (e) {
				return;
			}

			var extIndex = name.lastIndexOf('.');
			var ext = extIndex == -1 ? '' : name.substring(extIndex + 1).toLowerCase();

			if (stats.isDirectory()) {
				classify(curPath);
				return;
			}

			if (['js', 'jsx', 'ts', 'tsx'].indexOf(ext) != -1) {
				state.scanResult = false;
				return;
			}

			if (['scss', 'css'].indexOf(ext) != -1) {
				state.style = true;
			}
		});
	};

	classify(directoryPath);

	return state.scanResult !== false && state.style;
}

/*
* Returns true if the given directory directly contains a source file.
* Used to identify component folders within a ThirdParty directory (UI/Email).
*/
function directoryContainsSource(directoryPath) {
	var entries;
	try {
		entries = fs.readdirSync(directoryPath);
	} catch (e) {
		return false;
	}

	for (var i = 0; i < entries.length; i++) {
		var name = entries[i];
		var stats;
		try {
			stats = fs.lstatSync(path.join(directoryPath, name));
		} catch (e) {
			continue;
		}

		if (!stats.isFile()) {
			continue;
		}

		var extIndex = name.lastIndexOf('.');
		var ext = extIndex == -1 ? '' : name.substring(extIndex + 1).toLowerCase();

		if (componentSourceExtensions.indexOf(ext) != -1) {
			return true;
		}
	}

	return false;
}

/*
* Enumerates the components within the given ThirdParty folder.
* Returns the relative path (forward slashes) of each component underneath that folder.
* For the Api section components are always top level. For UI/Email, a folder directly
* containing source files is a component, and any sub-folders below it are treated as
* part of that component (they typically hold static assets or nested parts of the module).
*/
function enumerateComponents(thirdPartyFolder, isApi) {
	var results = [];

	if (!fs.existsSync(thirdPartyFolder)) {
		return results;
	}

	if (isApi) {
		var entries;
		try {
			entries = fs.readdirSync(thirdPartyFolder);
		} catch (e) {
			return results;
		}

		entries.forEach(name => {
			var stats;
			try {
				stats = fs.lstatSync(path.join(thirdPartyFolder, name));
			} catch (e) {
				return;
			}

			if (stats.isDirectory()) {
				results.push(name.replace(/\\/gi, '/'));
			}
		});

		return results;
	}

	// UI/Email - walk the tree. Component folders aren't descended in to,
	// so their sub-folders (e.g. "TinyMce/static") never become candidates themselves.
	var walker = (dirPath) => {
		var dirEntries;
		try {
			dirEntries = fs.readdirSync(dirPath);
		} catch (e) {
			return;
		}

		dirEntries.forEach(name => {
			var curPath = path.join(dirPath, name);
			var stats;
			try {
				stats = fs.lstatSync(curPath);
			} catch (e) {
				return;
			}

			if (!stats.isDirectory()) {
				return;
			}

			if (directoryContainsSource(curPath)) {
				results.push(path.relative(thirdPartyFolder, curPath).replace(/\\/gi, '/'));
			} else {
				walker(curPath);
			}
		});
	};

	walker(thirdPartyFolder);

	return results;
}

/*
* Returns the namespace suffixes (the parts after "Api.") declared within the given
* Api component folder. A component's runtime identifier isn't always its folder name -
* e.g. the "PasswordReset" module declares "Api.PasswordResetRequests" (named after its
* entity). So the folder name is matched, along with every declared "Api.*" namespace.
*/
function collectApiNamespaces(componentFolder) {
	var namespaces = [];

	var entries;
	try {
		entries = fs.readdirSync(componentFolder);
	} catch (e) {
		return namespaces;
	}

	entries.forEach(name => {
		if (!name.toLowerCase().endsWith('.cs')) {
			return;
		}

		var content;
		try {
			content = fs.readFileSync(path.join(componentFolder, name), 'utf8');
		} catch (e) {
			return;
		}

		var match = content.match(/^\s*namespace\s+([A-Za-z_][A-Za-z0-9_.]*)/m);
		if (!match) {
			return;
		}

		var namespaceName = match[1].trim();
		var apiPrefix = 'Api.';

		if (namespaceName.indexOf(apiPrefix) == 0 && namespaceName.length > apiPrefix.length) {
			namespaces.push(namespaceName.substring(apiPrefix.length));
		}
	});

	return namespaces;
}

/*
* Builds a regular expression which matches references to the given component.
* A reference is its canonical importable path, e.g. "UI/Alert", "Email/Centered",
* "Api.Users" or "Api/Users". An optional /Source/ThirdParty/ prefix is also matched.
* For the Api section the component's declared C# namespaces (e.g. "Api.PasswordResetRequests")
* are also matched, since those can be derived from the entity rather than the folder name.
*/
function buildReferenceExpression(componentRelPath, sectionConfig, namespaceSuffixes) {
	var boundariesFollow = ['/' + escapeRegex(componentRelPath)];

	(namespaceSuffixes || []).forEach(suffix => {
		boundariesFollow.push('/' + escapeRegex(suffix));
		boundariesFollow.push('.' + escapeRegex(suffix));
	});

	var alternatives = boundariesFollow.map(item => item.substring(1)).join('|');

	var boundary = '(?:[/.\'"\\s,;:)\\]\\[{}>=]|$)';
	var expression;

	if (sectionConfig.dotNotation) {
		// Api: both "Api/Users" and "Api.Users" (C# namespaces).
		expression = '\\b' + sectionConfig.importPrefix + '(?:/ThirdParty)?[./](?:' + alternatives + ')' + boundary;
	} else {
		expression = '\\b' + sectionConfig.importPrefix + '(?:/Source/ThirdParty)?/' + escapeRegex(componentRelPath) + boundary;
	}

	return new RegExp(expression);
}

function removeEmptyParents(folderPath, untilFolder) {
	var current = folderPath;

	while (current && current != untilFolder && current.startsWith(untilFolder)) {
		var contents;
		try {
			contents = fs.readdirSync(current);
		} catch (e) {
			break;
		}

		if (contents.length != 0) {
			break;
		}

		try {
			fs.rmdirSync(current);
		} catch (e) {
			break;
		}

		current = path.dirname(current);
	}
}

function nowTimestamp() {
	var date = new Date();
	var pad = (n) => (n < 10 ? '0' + n : '' + n);
	return '' + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
		'-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
}

export const run = (config: SocialStackConfig) => {

	var section = ((config.commandLine['-'] || [])[0] || '').toLowerCase();

	if (!sections[section]) {
		console.log("Invalid valid section '" + section + "' - use one of: Api, Email, UI");
		return;
	}

	var sectionConfig = sections[section];

	var projectRoot = path.normalize(config.projectRoot);

	var thirdPartyFolder = path.join(projectRoot, ...sectionConfig.thirdPartyPath);

	if (!fs.existsSync(thirdPartyFolder)) {
		console.log("This project has no " + sectionConfig.thirdPartyPath.join('/') + " folder - nothing to cull.");
		return;
	}

	var dryRun = config.commandLine.dryRun ? true : false;
	var skipPrompt = config.commandLine.yes ? true : false;

	console.log("Examining " + sectionConfig.importPrefix + " components in " + sectionConfig.thirdPartyPath.join('/') + "..");

	var components = enumerateComponents(thirdPartyFolder, sectionConfig.api);

	if (!components.length) {
		console.log("No components found in " + sectionConfig.thirdPartyPath.join('/') + ".");
		return;
	}

	// Read all searchable files in the project once.
	var allFiles = [];
	collectTextFiles(projectRoot, allFiles);

	var thirdPartyRootNormalized = thirdPartyFolder.replace(/\\/gi, '/');
	var unused = [];
	var used = [];

	// Determine which components are referenced anywhere in the project (outside their own folder).
	components.forEach(componentRelPath => {
		var componentFolder = path.join(thirdPartyFolder, ...componentRelPath.split('/'));
		var namespaces = sectionConfig.api ? collectApiNamespaces(componentFolder) : [];
		var expressions = [buildReferenceExpression(componentRelPath, sectionConfig, namespaces)];
		var componentFolderNormalized = componentFolder.replace(/\\/gi, '/');

		// Components which only contain stylesheets are global styles (their SCSS is
		// automatically bundled) and are never referenced by import path - leave them intact.
		var globalStyles = !sectionConfig.api && directoryIsStylesOnly(componentFolder);

		// Validation functions are typically referenced by their bare name within a
		// validate property, e.g. validate={['Required', 'Password']}.
		if (!sectionConfig.api && /^Functions\/Validation\/[^/]+$/.test(componentRelPath)) {
			var leafName = componentRelPath.substring(componentRelPath.lastIndexOf('/') + 1);
			expressions.push(new RegExp('\\bvalidate\\s*=\\s*\\{[^}]*[\'"]' + escapeRegex(leafName) + '[\'"]'));
		}

		var isReferenced = globalStyles || allFiles.some(file => {
			// Skip the component's own files.
			if (file.relPath.startsWith(componentFolderNormalized + '/')) {
				return false;
			}

			return expressions.some(expression => expression.test(file.content));
		});

		if (isReferenced) {
			used.push(componentRelPath);
		} else {
			unused.push(componentRelPath);
		}
	});

	if (!unused.length) {
		console.log("No unused components found.");
		return;
	}

	console.log('');
	console.log("The following " + unused.length + " unused " + sectionConfig.importPrefix + " component(s) were found:");

	unused.forEach(name => {
		console.log("  " + sectionConfig.importPrefix + "/" + name + "  (" + path.join(thirdPartyFolder, ...name.split('/')) + ")");
	});

	if (dryRun) {
		console.log('');
		console.log("Dry run - nothing was removed. Run without --dryRun to remove these components.");
		return;
	}

	var doRemove = () => {
		var removed = [];

		unused.forEach(name => {
			var componentFolder = path.join(thirdPartyFolder, ...name.split('/'));

			if (deleteFolderRecursive(componentFolder)) {
				removed.push(name);
			} else {
				console.log("Couldn't remove " + sectionConfig.importPrefix + "/" + name + " (it doesn't exist, skipping)");
			}

			// Remove any empty parent folders left behind (e.g. a grouping folder whose only child was removed).
			removeEmptyParents(path.dirname(componentFolder), thirdPartyFolder);
		});

		// Build the log of everything which was removed.
		var logLines = [];
		logLines.push("socialstack cull - " + sectionConfig.importPrefix);
		logLines.push("Date: " + new Date().toISOString());
		logLines.push("Project: " + projectRoot);
		logLines.push("");
		logLines.push("Components found: " + components.length);
		logLines.push("Components removed: " + removed.length);
		logLines.push("");
		logLines.push("Removed components:");

		removed.forEach(name => {
			logLines.push("  " + sectionConfig.importPrefix + "/" + name + "  (" + path.join(thirdPartyFolder, ...name.split('/')) + ")");
		});

		var logContents = logLines.join('\r\n') + '\r\n';

		var logFolder = path.join(projectRoot, 'Logs');
		var logPath = path.join(logFolder, 'cull-' + sectionConfig.importPrefix.toLowerCase() + '-' + nowTimestamp() + '.log');

		try {
			if (!fs.existsSync(logFolder)) {
				fs.mkdirSync(logFolder, { recursive: true });
			}
			fs.writeFileSync(logPath, logContents, 'utf8');
		} catch (e) {
			console.log("Unable to write the cull log to " + logPath + " - " + e);
		}

		console.log('');
		console.log("Removed " + removed.length + " unused component(s).");
		removed.forEach(name => {
			console.log("  " + sectionConfig.importPrefix + "/" + name);
		});

		if (removed.length != unused.length) {
			console.log("Note: " + (unused.length - removed.length) + " of the identified component(s) couldn't be removed.");
		}

		console.log("Removal log written to " + logPath);
	};

	if (skipPrompt) {
		doRemove();
		return;
	}

	// Ask for confirmation before removing anything.
	var rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	rl.question("Remove these " + unused.length + " component(s)? (y/N): ", answer => {
		rl.close();

		if (answer && answer.toLowerCase() == 'y') {
			doRemove();
		} else {
			console.log("Cancelled - nothing was removed.");
		}
	});
};