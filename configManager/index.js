var fs = require('fs');
var getAppDataPath = require('appdata-path');
var adp = getAppDataPath('socialstack');
var settingsPath = adp + '/settings.json';

var _localConfig;

/*
* Reads the global socialstack config info (sequentially)
*/
function getLocalConfig(){
	if(_localConfig){
		return _localConfig;
	}
	
	return _localConfig = new jsConfigManager(settingsPath).get();
}

function jsConfigManager(filepath){
	this.get = function(){
		try{
			var file = fs.readFileSync(filepath, {encoding: 'utf8'});
			
			// Strip BOM:
			file = file.replace(/^\uFEFF/, '');
		}catch(e){
			// Doesn't exist
			return {};
		}
		
		var result;
		
		try{
			result = JSON.parse(file);
		}catch(e){
			console.error('A JSON settings file failed to parse. It\'s at ' + filepath + '. Try opening the file and validating it in a JSON validator. Here\'s the full error: ');
			throw e;
		}
		
		return result;
	};
	
	this.update = function(newCfg){
		fs.writeFileSync(filepath,JSON.stringify(newCfg, null, 4), {encoding: 'utf8'});
	};
}

module.exports = {
	jsConfigManager,
	getLocalConfig,
	settingsPath
};