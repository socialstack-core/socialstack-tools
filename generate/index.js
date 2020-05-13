var pluralize = require('pluralize');
var readline = require('readline');
var fs = require('fs');

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
		
		var swaps = {
			anEntity: aOrAn + lowerize(singular),
			AnEntity: capitalize(aOrAn) + singular,
			Entity: singular,
			entity: lowerize(singular),
			Entities: names.entity,
			entities: lowerize(names.entity)
		};
		
		// For each file in Api/TYPE..
		var templateDir = __dirname + '/' + moduleSet + '/' +type;
		
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
			
			console.log('Generated ' + names.fqName);
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
	
	function handleModule(){
		currentModule++;
		
		if(currentModule >= modules.length){
			console.log('Done');
			return;
		}
		
		var originalInput = modules[currentModule];
		
		var pieces = originalInput.trim().split('/');
		var entity = capitalize(pieces.pop().trim());
		
		var firstPiece = 'api';
		
		if(pieces.length > 0){
			// Api is assumed otherwise.
			firstPiece = pieces.shift().trim().toLowerCase();
		}
		
		var fqNameBase = capitalize(firstPiece);
		
		if(pieces.length>0){
			// Subdirectories
			for(var i=0;i<pieces.length;i++){
				fqNameBase += '/';
				fqNameBase += capitalize(pieces[i].trim());
			}
		}
		
		fqName = fqNameBase + '/' + entity;
	
		var names = {
			pieces,
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
		
		}else{
			throw new Error('Unrecognised module type: ' + originalInput + '. UI, Admin or Api are the acceptable types here. If you want a subdomain, you must also add e.g. Api/ at the start.');
		}
	}
	
	console.log('Module generator starting: Writes code for you from common templates.');
	
	currentModule = -1;
	handleModule();
	
};