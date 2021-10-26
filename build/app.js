var fetch = require('node-fetch');
var fs = require('fs');
var path = require('path');
const {pipeline} = require('stream');
const {promisify} = require('util');
const streamPipeline = promisify(pipeline);


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
	
	// Get list of locales:
	console.log("Getting locales from instance (1/5)");
	return get('v1/locale/list', true)
		.then(localeJson => {
			
			var locales = JSON.parse(localeJson).results;
			
			console.log(locales.length + " locale(s) found. Obtaining JS/ CSS files, one per locale (2/5)");
			
			var promisesJs = locales.map(locale => get('pack/main.js?lid=' + locale.id).then(fileContent => saveFile('App/www/pack/main.' + locale.code + '.js', fileContent)));
			var promisesCss = locales.map(locale => get('pack/main.css?lid=' + locale.id).then(fileContent => saveFile('App/www/pack/main.' + locale.code + '.css', fileContent)));
			
			promisesJs.push(saveFile('App/www/pack/locales.json', localeJson));
			
			return Promise.all(promisesJs, promisesCss);
		})
		.then(() => {
			
			console.log("Preparing static assets (3/5) {temporarily skipping}");
			
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
			
		})
		.then(() => {
			
			console.log("Constructing HTML (4/5)");
			
			var appSpecificJs = 'var contentSource="' + config.apiUrl + '";' + fs.readFileSync(__dirname + "/urlLookup.js", {encoding: 'utf8'});
			
			// Todo: construct HTML pg with static pages in there.
			return post('pack/static-assets/mobile-html', {localeId: 1, apiHost: config.apiUrl, customJs: appSpecificJs}, true).then(html => {
				
				return saveFile('App/www/index.en.html', html);
				
			});
			
		})
		.then(() => {
			
			console.log("Invoking cordova (5/5) {temporarily skipping}");
			
			
		});
}

module.exports = {
	buildApp
};