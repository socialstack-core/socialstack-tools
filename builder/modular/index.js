var fs = require('fs');
var path = require('path');
var mkdir = require('../buildwatch/mkdir-recursive.js');
var builder = require('./build.js');

function addError(config, message){
	var response = null;
	
	if(config.onError){
		response = config.onError(message);
	}
	
	if(!response || !response.silent){
		console.error(message);
	}
}

module.exports = {
	build: config => builder(config).catch(e => addError(config, e))
};