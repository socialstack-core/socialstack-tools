var fs = require('fs');

// Include the build/ watch engine:
var buildwatch = require('./buildwatch/index.js');

// Include the module build/ watch engine:
var modular = require('./modular/index.js');


module.exports = {
	
	/*
	* Called by builder.js which is included in project files.
	*/
	builder: (config) => {
		
		console.log("Depreciated build route. It's highly recommended to upgrade this project to the latest Socialstack.");
		config = config || {};
		
		// Build or watch mode from the command line?
		var isWatch = process.argv[process.argv.length-1].toLowerCase() == 'watch';
		
		if(!config.projectRoot){
			config.projectRoot = process.cwd();
		}
		
		// Module we're building will be called..
		var moduleName = config.moduleName || 'UI';
		
		// Its source files are in..
		var sourceDir = config.sourceDir || config.projectRoot + '/UI/Source';
		
		// And we're outputting it to..
		var outputDir = config.outputDir || config.projectRoot + '/UI/public/pack/';
		
		if(!fs.existsSync(sourceDir)){
			console.log('Note: We\'re running with a prebuilt UI. This is a normal mode and happens because your "' + sourceDir + '" directory doesn\'t exist. If this isn\'t intentional and you\'d like to be able to runtime update your UI modules, make sure the previous directory exists.');
			return;
		}
		
		var builderConfig = config.builderConfig || {};
		
		var uiPromise = buildwatch[isWatch ? 'watch' : 'build']({
			...builderConfig,
			sourceDir,
			moduleName,
			relativePaths: config.relativePaths,
			baseUrl: config.baseUrl,
			outputStaticPath: config.outputStaticPath || outputDir + 'modules/',
			outputCssPath: config.outputCssPath || outputDir + 'styles.css',
			outputJsPath: config.outputJsPath || outputDir + 'main.generated.js',
		});
		
	},
	
	// Also directly expose the build/watch engines:
	buildwatch,
	modular
};