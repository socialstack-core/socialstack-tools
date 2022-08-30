var fetch = require('node-fetch');
var fs = require('fs');
var path = require('path');
const {pipeline} = require('stream');
const {promisify} = require('util');
const streamPipeline = promisify(pipeline);
var { jsConfigManager } = require('../configManager');

function getAppSettings(config){
	
	if(!config.projectRoot){
		return null;
	}
	
	if(config.loadedAppSettings){
		return config.loadedAppSettings;
	}
	
	var appsettingsManager = new jsConfigManager(config.projectRoot + "/appsettings.json");
	var appsettings = appsettingsManager.get();
	
	if(!appsettings){
		return null;
	}
	
	config.loadedAppSettings = appsettings;
	
	return appsettings;
}

function buildApp(config){
	
	var dir = config.calledFromPath;
	var requiresSlash = config.instanceUrl[config.instanceUrl.length-1] != '/';
	
	function get(url, raw){
		
		if(requiresSlash){
			url = '/' + url;
		}
		
		return fetch(config.instanceUrl + url)
			.then(r => (url.indexOf('.') !=-1 || raw) ? r.text() : r.json().then(r => r.results || r.result));
	}
	
	function post(url, body, raw){
		
		if(requiresSlash){
			url = '/' + url;
		}
		
		return fetch(
			config.instanceUrl + url,
			{
				headers: {'Content-Type': 'application/json'},
				method: 'post',
				body: JSON.stringify(body)
			}
		).then(r => (url.indexOf('.') !=-1 || raw) ? r.text() : r.json().then(r => r.results || r.result));
	}
	
	function getAsFile(url, targetPath){
		if(requiresSlash){
			url = '/' + url;
		}
		
		return fetch(config.instanceUrl + url)
		.then(response => {
			if (!response.ok) throw new Error('unexpected response ' + response.statusText);
			
			return streamPipeline(response.body, fs.createWriteStream(targetPath));
		});
	}
	
	function saveFile(filepath, fileContent){
		
		var normPath = path.normalize(dir + '/' + filepath);
		
		return new Promise((s, r) => {
			
			fs.mkdir(path.dirname(normPath), { recursive: true }, (err) => {
				if (err) {
					return r(err);
				}
				
				fs.writeFile(normPath, fileContent,{encoding:'utf8'}, (err) => {
					
					if (err) {
						return r(err);
					}
					
					s();
					
				});
				
			});
		});
	}
	
	function configNotFound(platform){
		throw new Error(
			'Config does not exist in appsettings for platform "' + platform + 
			'" (you used a command line flag for something you don\'t have configured). The config comes from appsettings.json and is "app":{"' + platform + 
			'": {...}}'
		);
	}
	
	function compareAsset(asset, targetPath){
		
		return new Promise((s, r) => {
			
			// Target asset goes at..
			var normPath = path.normalize(dir + '/' + targetPath);
			
			fs.mkdir(path.dirname(normPath), { recursive: true }, (err) => {
				if (err) {
					return r(err);
				}
				
				fs.stat(normPath, (err, stat) => {
					
					var assetWriteTime = new Date(asset.modifiedUtc - 62135596800000);
						
					if (stat) {
						// Compare size + modified date.
						if(asset.size == stat.size && new Date(stat.mtimeMs) >= assetWriteTime){
							return s();
						}
					}
					
					var url = asset.ref.replace('s:ui/', '/pack/static/');
					
					// Download required.
					return getAsFile(url, normPath);
				});
				
			});
			
		});
	}
	
	var appSettings = getAppSettings(config) || {};
	var appConfig = appSettings.App || appSettings.app;
	
	// Can specify either -desktop or -mobile.
	// If you specify neither, it is based on whatever is in appsettings.json
	// If that's empty too, then -mobile is assumed (a Cordova build).
	var platform;
	
	if(config.commandLine.desktop){
		platform = 'desktop';
	}else if(config.commandLine.mobile){
		platform = 'mobile';
	}
	
	if(appConfig){
		if(platform){
			appConfig = appConfig[platform];
			
			if(!appConfig){
				return configNotFound(platform);
			}
		}else if(appConfig.mobile){
			appConfig = appConfig.mobile;
			platform = 'mobile';
		}else if(appConfig.desktop){
			appConfig = appConfig.desktop;
			platform = 'desktop';
		}
	}else if(platform){
		return configNotFound(platform);
	}
	
	if(!platform){
		// Cordova.
		platform = 'mobile';
	}
	
	var steps = 5;
	
	if(platform == 'desktop'){
		// Electron.
		steps = 4;
	}
	
	var defaults = {
		directory: 'App/www'
	};
	
	var buildConfig = appConfig ? {
		...defaults,
		...appConfig
	} : defaults;
	
	// Get list of locales:
	console.log("Getting locales from instance (1/" + steps + ")");
	
	var prom = get('v1/locale/list', true)
	.then(localeJson => {
		
		var locales = JSON.parse(localeJson).results;
		
		console.log(locales.length + " locale(s) found. Obtaining JS/ CSS files, one per locale (2/" + steps + ")");
		
		var promisesJs = locales.map(locale => get('pack/main.js?lid=' + locale.id).then(fileContent => saveFile(buildConfig.directory + '/pack/main.' + locale.code + '.js', fileContent)));
		var promisesCss = locales.map(locale => get('pack/main.css?lid=' + locale.id).then(fileContent => saveFile(buildConfig.directory + '/pack/main.' + locale.code + '.css', fileContent)));
		
		promisesJs.push(saveFile(buildConfig.directory + '/pack/locales.json', localeJson));
		
		return Promise.all(promisesJs, promisesCss).then(() => locales);
	})
	.then(locales => {
		
		console.log("Preparing static assets (3/" + steps + ") {temporarily skipping}");
		
		/*
		return get('pack/static-assets/list.json').then(assetList => {
			assetList = JSON.parse(assetList);
			
			var promises = assetList.map((asset) => {
				// First fwd slash (After "s:ui/"):
				var appPath = asset.ref.substring(asset.ref.indexOf('/'));
				
				// Note that these copied assets always use lowercase names.
				return compareAsset(asset, 'App/www/pack/static' + appPath);
			});
			
			return Promise.all(promises);
		});
		*/
		
		// Todo: create static assets folder. only update if actually necessary though, and delete files that don't exist anymore.
		return locales;
	})
	.then(locales => {
		
		console.log("Constructing HTML (4/" + steps + ")");
		
		var appSpecificJs = 'var availableLocales=' + (locales ? JSON.stringify(locales) : 'null') + ';';
		appSpecificJs += 'var contentSource="' + config.apiUrl + '";' + fs.readFileSync(__dirname + "/appFrontend.js", {encoding: 'utf8'});
		
		var promisesHtml = locales.map(locale => {
			
			return post('pack/static-assets/mobile-html', {localeId: locale.id, apiHost: config.apiUrl, customJs: '{{APP_JS_SUBSTITUTE}}'}, true).then(html => {
			
				return saveFile(buildConfig.directory + '/index.' + locale.code + '.html', html.replace('{{APP_JS_SUBSTITUTE}}', 'var fileLocaleId=' + locale.id + ';' + appSpecificJs));
				
			});
			
		});
		
		return Promises.all(promisesHtml);
	});
	
	if(platform == 'mobile'){
		prom = prom.then(() => {
			
			console.log("Invoking cordova (5/" + steps + ") {temporarily skipping}");
			
			
		});
	}
	
	return prom;
}

module.exports = {
	buildApp
};