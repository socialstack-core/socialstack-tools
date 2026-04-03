// @ts-nocheck
import { SocialStackConfig } from '../types';
import pluralize from 'pluralize';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { jsConfigManager } from '../configManager';
import { generateInstallCommand } from '../create/helpers.js';
import { getCoreZipPath, findClosestCoreBranch } from '../versions/helper';

export const run = async (config: SocialStackConfig) => {
	var appsettingsPath = path.join(config.projectRoot, 'appsettings.json');
	var appsettings = new jsConfigManager(appsettingsPath).get();

	if (!appsettings.CoreVersion) {
		console.error('CoreVersion is required in appsettings.json for the generate command.');
		console.error('Run "socialstack create" first to set up a new project.');
		return;
	}

	var coreVersion = appsettings.CoreVersion;
	var coreBranch = 'core-' + coreVersion;

	console.log('Loading templates for version ' + coreVersion + '...');

	var coreDir = await getCoreZipPath(coreBranch);
	var templateBase = path.join(coreDir, 'ModuleTemplates');

	if (!fs.existsSync(templateBase)) {
		console.error('ModuleTemplates directory not found in core version: ' + coreBranch);
		console.error('This core version may not support the generate command.');
		return;
	}

	var modules = config.commandLine['-'];

	if (!modules || !modules.length) {
		console.log("Please specify the module(s) you'd like to generate. For example, 'socialstack g Api/Worlds'.");
		return;
	}

	var newConfiguration = {};

	function askFor(text, configName) {
		return new Promise<[any, string, string]>((success, reject) => {

			if (newConfiguration[configName] != undefined) {
				return success(newConfiguration, configName, newConfiguration[configName]);
			}

			if (Array.isArray(config.commandLine[configName]) && config.commandLine[configName].length) {
				newConfiguration[configName] = config.commandLine[configName][0];
				return success(newConfiguration, configName, newConfiguration[configName]);
			}

			console.log(text);

			var rl = readline.createInterface(process.stdin, process.stdout);
			rl.setPrompt(configName + ': ');
			rl.prompt();
			rl.on('line', function (line) {
				newConfiguration[configName] = line;
				rl.close();
				success(newConfiguration, configName, line);
			});
		});
	}

	function capitalize(s) {
		if (typeof s !== 'string') return '';
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	function lowerize(s) {
		if (typeof s !== 'string') return '';
		return s.charAt(0).toLowerCase() + s.slice(1);
	}

	var currentModule = 0;

	function dashName(label) {
		return label.replace(/([^A-Z])([A-Z])/g, '$1-$2');
	}

	function createModule(moduleSet, type, names) {
		try {
			var targetDirectory = config.projectRoot + '/';

			if (moduleSet == 'Api') {
				targetDirectory += names.fqName;
			} else {
				targetDirectory += moduleSet + '/Source' + names.fqName.substring(moduleSet.length);
			}

			fs.mkdirSync(targetDirectory, { recursive: true });
		} catch (e) {
			if (e.code == 'EEXIST') {
				console.log('A module at ' + names.fqName + ' already exists. Skipping.');
				handleModule();
				return;
			} else {
				throw e;
			}
		}

		var entity = names.entity;
		var singular = pluralize.singular(entity);

		var vowelRegex = '^[aieouAIEOU].*';
		var startsWithVowel = singular.match(vowelRegex);
		var aOrAn = startsWithVowel ? 'an ' : 'a ';
		var fqEntity = singular;

		if (entity == singular && moduleSet == 'Api') {
			fqEntity = 'Api.' + entity + '.' + entity;
		}

		var mergedName = '';

		if (moduleSet != 'Api') {
			mergedName += moduleSet.toLowerCase();
		}

		names.subDirectories.forEach(subDir => {
			if (mergedName != '') {
				mergedName += '-';
			}
			mergedName += subDir.toLowerCase();
		});

		var dn = dashName(entity);

		if (mergedName != '') {
			mergedName += '-';
		}
		mergedName += dn.toLowerCase();

		var swaps = {
			'fully-qualified-entity': mergedName,
			anEntity: aOrAn + lowerize(singular),
			AnEntity: capitalize(aOrAn) + singular,
			FullyQualifiedEntity: fqEntity,
			Entity: singular,
			entity: lowerize(singular),
			Entities: entity,
			entities: lowerize(entity)
		};

		var templateDir = path.join(templateBase, moduleSet, type);
		copyTemplate(templateDir, swaps, targetDirectory, names.fqName);
	}

	function copyTemplate(templateDir, swaps, targetDirectory, generatedName) {
		fs.readdir(templateDir, function (err, files) {
			if (err) {
				throw err;
			}

			files.forEach(file => {
				var targetName = swap(file, swaps);
				var sourceContent = fs.readFileSync(path.join(templateDir, file), { encoding: 'utf8' });
				var swappedContent = swap(sourceContent, swaps);
				fs.writeFileSync(path.join(targetDirectory, targetName), swappedContent, { encoding: 'utf8' });
			});

			console.log('Generated ' + generatedName);
			handleModule();
		});
	}

	function swap(text, swaps) {
		for (var sourceValue in swaps) {
			var targetValue = swaps[sourceValue];
			var regex = new RegExp(sourceValue, 'g');
			text = text.replace(regex, targetValue);
		}
		return text;
	}

	function generateNginxConfig() {
		var targetDirectory = config.projectRoot + '/Nginx';

		fs.mkdirSync(targetDirectory, { recursive: true });

		var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
		var appsettingsData = appsettingsManager.get();

		var publicUrl = appsettingsData.PublicUrl;

		var protoParts = publicUrl.split('://');

		if (protoParts.length > 1) {
			publicUrl = protoParts[1];
		}

		publicUrl = publicUrl.replace(/\//gi, '');

		var urlSet = publicUrl;

		var wwwUrl = publicUrl;

		if (publicUrl.indexOf('www.') != 0) {
			wwwUrl = 'www.' + publicUrl;
		}

		var rootUrl = wwwUrl.substring(4);

		var urlSetNoRoot = wwwUrl + ' *.' + publicUrl;
		var urlSetFull = urlSetNoRoot + ' ' + rootUrl;

		var swaps = {
			PreferredUrl: wwwUrl,
			UrlSet: urlSetFull,
			UrlsNoRoot: urlSetNoRoot,
			RootUrl: rootUrl,
			Url: publicUrl,
			RemoteDirectory: '/var/www/' + publicUrl,
			Port: appsettingsData.Port || 5050
		};

		var nginxTemplateDir = path.join(templateBase, 'Nginx');
		copyTemplate(nginxTemplateDir, swaps, targetDirectory, 'NGINX Config');
	}

	function generateSystemDConfig() {
		var targetDirectory = config.projectRoot + '/SystemD';

		fs.mkdirSync(targetDirectory, { recursive: true });

		var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
		var appsettingsData = appsettingsManager.get();

		var publicUrl = appsettingsData.PublicUrl;

		var protoParts = publicUrl.split('://');

		if (protoParts.length > 1) {
			publicUrl = protoParts[1];
		}

		publicUrl = publicUrl.replace(/\//gi, '');

		var swaps = {
			Url: publicUrl
		};

		var systemdTemplateDir = path.join(templateBase, 'SystemD');
		copyTemplate(systemdTemplateDir, swaps, targetDirectory, 'SystemD Config (Linux service config)');
	}

	function handleModule() {
		currentModule++;

		if (currentModule >= modules.length) {
			console.log('Done');
			return;
		}

		var originalInput = modules[currentModule];
		originalInput = originalInput.replace(/\\/gi, '/');
		originalInput = originalInput.trim();

		if (originalInput.indexOf('.json') != -1) {
			var json = JSON.parse(fs.readFileSync(originalInput, 'utf8'));

			if (!json) {
				console.log('Your json file was found, but it\'s empty. Check: ' + originalInput);
				handleModule();
				return;
			}

			if (Array.isArray(json)) {
				modules = modules.concat(json);
			} else if (json.modules) {
				modules = modules.concat(json.modules);
			} else {
				console.log('If you\'d like to list modules to generate in a json file, it should either be an array of textual names, or {"modules": [..]} where the "modules" array is again an array of textual names.');
			}

			handleModule();
			return;
		}

		var pieces = originalInput.split('/');

		if (pieces.length == 1) {
			var first = pieces[0].toLowerCase();

			if (first == 'nginx') {
				generateNginxConfig();
				return;
			} else if (first == 'systemd' || first == 'service') {
				generateSystemDConfig();
				return;
			} else if (first == 'sql') {
				console.log(generateInstallCommand(config) + ';');
				return;
			}
		}

		var firstPiece = 'api';

		if (pieces.length > 1) {
			firstPiece = pieces.shift().trim().toLowerCase();
		}

		var entity = capitalize(pieces.pop().trim());

		var fqNameBase = capitalize(firstPiece);
		var subDirectories = [];

		if (pieces.length > 0) {
			for (var i = 0; i < pieces.length; i++) {
				var subdirName = capitalize(pieces[i].trim());
				subDirectories.push(subdirName);
				fqNameBase += '/';
				fqNameBase += subdirName;
			}
		}

		var fqName = fqNameBase + '/' + entity;

		var names = {
			pieces,
			subDirectories,
			originalInput,
			entity,
			fqNameBase,
			fqName
		};

		if (firstPiece == 'api') {
			if (pluralize.isPlural(entity)) {
				createModule('Api', 'Default', names);
			} else {
				var pluralEntity = pluralize.plural(entity);
				var fqNamePlural = fqNameBase + '/' + pluralEntity;

				askFor(
					'You\'ve provided a singular name (' + entity + '). ' +
					'Singular named modules are created as service only - without a ' + entity + '.cs - to avoid Api.' + entity + '.' + entity + ' weirdness. ' +
					'If you intended a service only module, enter Y to continue. ' +
					'If you wanted an entity called ' + entity + ' then enter E for the module to instead be created as ' + fqNamePlural + '. ' +
					'Otherwise enter N to exit.',
					'serviceonly'
				).then(config => {
					if (config.serviceonly == 'E' || config.serviceonly == 'e') {
						names.entity = pluralEntity;
						names.fqName = fqName = fqNamePlural;
						createModule('Api', 'Default', names);
					} else if (config.serviceonly == 'y' || config.serviceonly == 'Y') {
						createModule('Api', 'ServiceOnly', names);
					} else {
						console.log('Not generating anything for "' + originalInput + '"');
						handleModule();
					}
				});
			}
		} else if (firstPiece == 'ui') {
			createModule('UI', 'Default', names);
		} else if (firstPiece == 'admin') {
			createModule('Admin', 'Default', names);
		} else if (firstPiece == 'email') {
			createModule('Email', 'Default', names);
		} else {
			throw new Error('Unrecognised module type: ' + originalInput + '. UI, Admin, Email or Api are the acceptable types here. If you want a subdirectory, you must also add e.g. Api/ at the start.');
		}
	}

	currentModule = -1;
	handleModule();
};
