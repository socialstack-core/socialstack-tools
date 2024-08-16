var GlobalSourceFileMap = require( './GlobalSourceFileMap.js');
var UIBundle  = require( './UIBundle.js');
var UIBuildCache  = require( './UIBuildCache.js');
var NpmBundle  = require( './NpmBundle.js');


/// <summary>
/// Starts a build. Returns a promise.
/// Config is currently {bundles, projectRoot, minified}
/// </summary>
module.exports = function build(config)
{
	var cache = new UIBuildCache(config.cacheDir); // null/undef will disable the cache. The value is the directory which will contain a binary file.
	
	var globalMap = new GlobalSourceFileMap(cache);
	
	var sourceBuilders = [];
	var startPromises = [];
	
	// Create a group of builders for each bundle of files (all in parallel):
	config.bundles.forEach(bundleName => {
		var bundle = new UIBundle(bundleName, config.projectRoot, globalMap, config.minified, cache);
		sourceBuilders.push(bundle);
		startPromises.push(bundle.start());
	});
	
	startPromises.push(cache.start());
	
	return Promise.all(startPromises)
	.then(() => {
		
		// Sort global map:
		globalMap.sort();
		
		// global map must now check for changes by comparing to the cache (if one is present).
		globalMap.checkForChanges();
		
		// If it changed, load its file contents and build the header.
		if(globalMap.hasChanges){
			return globalMap.loadContents();
		}
		
	}).then(() => {
		// Happens in a separate loop to ensure all the global SCSS has loaded first.
		var proms = sourceBuilders.map(builder => builder.buildEverything());
		
		/*
		// If there are any npm packages as well, build those:
		var npmBundle = new NpmBundle(config.projectRoot, config.minified, globalMap);
		
		var npmPromises = [];
		
		for(var k in globalMap.npmPackages){
			// Add via require. This will result in a parse of the file, 
			// followed by potentially addRequire-ing dependencies too.
			// npmPromises.push(npmBundle.addRequire(k));
		}
		
		proms.push(Promise.all(npmPromises).then(() => npmBundle.buildEverything()));
		*/
		
		return Promise.all(proms);
	}).then(() => {
		
		// Save the cache:
		return cache.save(globalMap, sourceBuilders);
		
	}).catch(console.error);
}