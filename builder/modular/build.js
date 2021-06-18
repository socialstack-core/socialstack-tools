var GlobalSourceFileMap = require( './GlobalSourceFileMap.js');
var UIBundle  = require( './UIBundle.js');
var NpmBundle  = require( './NpmBundle.js');


/// <summary>
/// Starts a build. Returns a promise.
/// Config is currently {bundles, projectRoot, minified}
/// </summary>
module.exports = function build(config)
{
	var globalMap = new GlobalSourceFileMap();
	
	var sourceBuilders = [];
	var startPromises = [];
	
	// Create a group of builders for each bundle of files (all in parallel):
	config.bundles.forEach(bundleName => {
		var bundle = new UIBundle(bundleName, config.projectRoot, globalMap, config.minified);
		sourceBuilders.push(bundle);
		startPromises.push(bundle.start());
	});
	
	return Promise.all(startPromises).then(() => {
		
		// Sort global map:
		globalMap.sort();
		
		// Happens in a separate loop to ensure all the global SCSS has loaded first.
		var proms = sourceBuilders.map(builder => builder.buildEverything());
		
		// If there are any npm packages as well, build those:
		var npmBundle = new NpmBundle(config.projectRoot, config.minified, globalMap);
		
		var npmPromises = [];
		
		for(var k in globalMap.npmPackages){
			// Add via require. This will result in a parse of the file, 
			// followed by potentially addRequire-ing dependencies too.
			// npmPromises.push(npmBundle.addRequire(k));
		}
		
		proms.push(Promise.all(npmPromises).then(() => npmBundle.buildEverything()));
		
		return Promise.all(proms);
	});
}