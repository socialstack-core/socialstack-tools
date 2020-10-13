var pluralize = require('pluralize');
var readline = require('readline');
var fs = require('fs');
var { jsConfigManager } = require('../configManager');
var { generateInstallCommand } = require('../create/helpers.js');

/*
* socialstack generate Api/Worlds  --> Uses the contents of the Api directory here as a template, then generates the named module.
*/

module.exports = (config) => {
	
	var modules = config.commandLine['-'];
	
	if(!modules || !modules.length){
		console.log("Please specify the module(s) you'd like to generate. For example, 'socialstack g Api/Worlds'.");
	}
	
	var newConfiguration = {};
	
	function askFor(text, configName){
		return new Promise((success, reject) => {
			
			if(newConfiguration[configName] != undefined){
				// Already set - skip.
				return success(newConfiguration, configName, newConfiguration[configName]);
			}
			
			console.log(text);
			
			var rl = readline.createInterface(process.stdin, process.stdout);
			rl.setPrompt(configName + ': ');
			rl.prompt();
			rl.on('line', function(line) {
				newConfiguration[configName] = line;
				rl.close();
				success(newConfiguration, configName, line);
			});	
		});
	}
	
	function capitalize(s) {
		if (typeof s !== 'string') return ''
		return s.charAt(0).toUpperCase() + s.slice(1)
	}
	
	function lowerize(s) {
		if (typeof s !== 'string') return ''
		return s.charAt(0).toLowerCase() + s.slice(1)
	}
	
	var currentModule = 0;
	
	function dashName(label){
		return label.replace(/([^A-Z])([A-Z])/g, '$1-$2');
	}
	
	function createModule(moduleSet, type, names){
		
		try{
			var targetDirectory = config.projectRoot + '/';
			
			// Insert the source dir if module set is not Api:
			if(moduleSet == 'Api'){
				targetDirectory += names.fqName;
			}else{
				targetDirectory += moduleSet + '/Source' + names.fqName.substring(moduleSet.length);
			}
			
			fs.mkdirSync(targetDirectory, { recursive: true });
		}catch(e){
			if(e.code == 'EEXIST'){
				console.log('A module at ' + names.fqName + ' already exists. Skipping.');
				handleModule();
				return;
			}else{
				throw e;
			}
		}
		
		var entity = names.entity;
		
		// Create singular version:
		var singular = pluralize.singular(entity);
		
		// A or an. This part is naive - "a umbrella" "a unicorn" would be outputted, but it's close enough!
		var vowelRegex = '^[aieouAIEOU].*';
		var startsWithVowel = singular.match(vowelRegex);
		var aOrAn = startsWithVowel ? 'an ' : 'a ';
		var fqEntity = singular;
		
		if(entity == singular && moduleSet == 'Api'){
			fqEntity = 'Api.' + entity + '.' + entity;
		}
		
		// merge in any directory names:
		var mergedName = '';
		
		names.subDirectories.forEach(subDir => {
			if(mergedName != ''){
				mergedName += '-';
			}
			mergedName += subDir.toLowerCase();
		});
		
		var dn = dashName(entity);
		
		if(mergedName != ''){
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
		
		// For each file in Api/TYPE..
		var templateDir = __dirname + '/' + moduleSet + '/' +type;
		copyTemplate(templateDir, swaps, targetDirectory, names.fqName);
	}
	
	function copyTemplate(templateDir, swaps, targetDirectory, generatedName) {
		fs.readdir(templateDir, function (err, files) {
			if(err){
				throw err;
			}
			
			files.forEach(file => {
				var targetName = swap(file, swaps);
				
				// Read the content:
				var sourceContent = fs.readFileSync( templateDir + '/' + file, {encoding: 'utf8'} );
				var swappedContent = swap(sourceContent, swaps);
				fs.writeFileSync(targetDirectory + '/' + targetName, swappedContent, {encoding: 'utf8'});
				
			});
			
			console.log('Generated ' + generatedName);
			handleModule();
		});
	}
	
	function swap(text, swaps){
		for(var sourceValue in swaps){
			var targetValue = swaps[sourceValue];
			var regex = new RegExp(sourceValue, 'g');
			text = text.replace(regex, targetValue);
		}
		return text;
	}
	
	function generateNginxConfig(){
		var targetDirectory = config.projectRoot + '/Nginx';
		
		fs.mkdirSync(targetDirectory, { recursive: true });
		
		var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
		var appsettings = appsettingsManager.get();
		
		var baseUrl = appsettings.BaseUrl;
		
		var protoParts = baseUrl.split('://');
		
		if(protoParts.length > 1){
			baseUrl = protoParts[1];
		}
		
		baseUrl = baseUrl.replace(/\//gi, '');
		
		var urlSet = baseUrl;
		
		
		var wwwUrl = baseUrl;
		
		if(baseUrl.indexOf('www.') != 0){
			wwwUrl = 'www.' + baseUrl;
		}
		
		// e.g. www.site.com -> site.com
		var rootUrl = wwwUrl.substring(4);
		
		/// www.site.com *.site.com site.com
		var urlSetNoRoot = wwwUrl + ' *.' + baseUrl;
		var urlSet = urlSetNoRoot + ' ' + rootUrl;
		
		var swaps = {
			PreferredUrl: wwwUrl,
			UrlSet: urlSet,
			UrlsNoRoot: urlSetNoRoot,
			RootUrl: rootUrl,
			Url: baseUrl,
			RemoteDirectory: '/var/www/' + baseUrl,
			Port: appsettings.Port || 5050
		};
		
		copyTemplate(__dirname + '/Nginx', swaps, targetDirectory, 'NGINX Config');
	}
	
	function generateSystemDConfig(){
		var targetDirectory = config.projectRoot + '/SystemD';
		
		fs.mkdirSync(targetDirectory, { recursive: true });
		
		var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
		var appsettings = appsettingsManager.get();
		
		var baseUrl = appsettings.BaseUrl;
		
		var protoParts = baseUrl.split('://');
		
		if(protoParts.length > 1){
			baseUrl = protoParts[1];
		}
		
		baseUrl = baseUrl.replace(/\//gi, '');
		
		var swaps = {
			Url: baseUrl
		};
		
		copyTemplate(__dirname + '/SystemD', swaps, targetDirectory, 'SystemD Config (Linux service config)');
	}
	
	function handleModule(){
		currentModule++;
		
		if(currentModule >= modules.length){
			console.log('Done');
			return;
		}
		
		var originalInput = modules[currentModule];
		originalInput = originalInput.replace(/\\/gi, '/');
		originalInput = originalInput.trim();
		
		if(originalInput.indexOf('.json') != -1){
			// Defined in a json file. It's either just an array, or {"modules": [..,..]}
			
			// Import the file:
			var json = require(first);
			
			if(!json){
				console.log('Your json file was found, but it\'s empty. Check: ' + originalInput);
				handleModule();
				return;
			}
			
			if(Array.isArray(json)){
				modules = modules.concat(json);
			}else if(json.modules){
				modules = modules.concat(json.modules);
			}else{
				console.log('If you\'d like to list modules to generate in a json file, it should either be an array of textual names, or {"modules": [..]} where the "modules" array is again an array of textual names.');
			}
			
			handleModule();
			return;
		}
		
		var pieces = originalInput.split('/');
		
		if(pieces.length == 1){
			var first = pieces[0].toLowerCase();
			
			if(first == 'nginx'){
				// NGINX config.
				generateNginxConfig();
				return;
			}else if(first == 'systemd' || first == 'service'){
				// SystemD service file generator.
				generateSystemDConfig();
				return;
			}else if(first == 'sql'){
				// SQL to create user/ db:
				console.log(generateInstallCommand(config) + ';');
				return;
			}
		}
		
		var firstPiece = 'api';
		
		if(pieces.length > 1){
			// Api is assumed otherwise.
			firstPiece = pieces.shift().trim().toLowerCase();
		}
		
		// Grab entity name now:
		var entity = capitalize(pieces.pop().trim());
		
		var fqNameBase = capitalize(firstPiece);
		var subDirectories = [];
		
		if(pieces.length>0){
			// There's still stuff left - these are subdirectories
			for(var i=0;i<pieces.length;i++){
				var subdirName = capitalize(pieces[i].trim());
				subDirectories.push(subdirName);
				fqNameBase += '/';
				fqNameBase += subdirName;
			}
		}
		
		fqName = fqNameBase + '/' + entity;
	
		var names = {
			pieces,
			subDirectories,
			originalInput,
			entity,
			fqNameBase,
			fqName
		};
		
		if(firstPiece == 'api'){
			
			// Is it plural?
			if(pluralize.isPlural(entity)){
				// With entity. This is the default, and no further checks are needed.
				createModule('Api', 'Default', names);
				
			}else{
				
				var pluralEntity = pluralize.plural(entity);
				var fqNamePlural = fqNameBase + '/' + pluralEntity;
				
				// Without entity, but we'll ask to confirm.
				askFor(
					'You\'ve provided a singular name (' + entity + '). ' + 
					'Singular named modules are created as service only - without a ' + entity + '.cs - to avoid Api.' + entity + '.' + entity + ' weirdness. ' + 
					'If you intended a service only module, enter Y to continue. '+
					'If you wanted an entity called ' + entity+ ' then enter E for the module to instead be created as ' + fqNamePlural + '. '+
					'Otherwise enter N to exit.',
					'serviceonly'
				).then(config => {
					console.log(config);
					
					if(config.serviceonly == 'E' || config.serviceonly == 'e'){
						// Actually an entity module.
						names.entity = pluralEntity;
						names.fqName = fqName = fqNamePlural;
						createModule('Api', 'Default', names);
					}else if(config.serviceonly == 'y' || config.serviceonly == 'Y'){
						// Service only module.
						createModule('Api', 'ServiceOnly', names);
					}else{
						// Skip!
						console.log('Not generating anything for "' + originalInput + '"');
						handleModule();
					}
					
				});
			}
			
		}else if(firstPiece == 'ui'){
			
			// Just a simple UI class.
			createModule('UI', 'Default', names);
		
		}else if(firstPiece == 'admin'){
			
			// Just a simple UI class.
			createModule('Admin', 'Default', names);
		
		}else if(firstPiece == 'email'){
			
			// Just a simple UI class.
			createModule('Email', 'Default', names);
		
		}else{
			throw new Error('Unrecognised module type: ' + originalInput + '. UI, Admin, Email or Api are the acceptable types here. If you want a subdirectory, you must also add e.g. Api/ at the start.');
		}
	}
	
	currentModule = -1;
	handleModule();
	
};