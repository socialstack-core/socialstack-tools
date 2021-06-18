var fs = require('fs');
var path = require('path');
var walk = function(dir, done, module) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
		var fName = file;
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          }, fName.toLowerCase() == 'thirdparty' ? module : module + '/' + fName);
        } else {
			if(fName == 'locale.json'){
				results.push({path: file, module});
			}
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

function pad(num){
	if(num<10){
		return '0' + num;
	}
	
	return ''+num;
}

var CHARS_GLOBAL_REGEXP = /[\0\b\t\n\r\x1a\"\'\\]/g; // eslint-disable-line no-control-regex
var CHARS_ESCAPE_MAP    = {
  '\0'   : '\\0',
  '\b'   : '\\b',
  '\t'   : '\\t',
  '\n'   : '\\n',
  '\r'   : '\\r',
  '\x1a' : '\\Z',
  '"'    : '\\"',
  '\''   : '\\\'',
  '\\'   : '\\\\'
};

// from sqlstring package
function sqlEscape(val){
	var chunkIndex = CHARS_GLOBAL_REGEXP.lastIndex = 0;
	var escapedVal = '';
	var match;

	while ((match = CHARS_GLOBAL_REGEXP.exec(val))) {
	escapedVal += val.slice(chunkIndex, match.index) + CHARS_ESCAPE_MAP[match[0]];
	chunkIndex = CHARS_GLOBAL_REGEXP.lastIndex;
	}

	if (chunkIndex === 0) {
	// Nothing was escaped
	return "'" + val + "'";
	}
	
	if (chunkIndex < val.length) {
		return "'" + escapedVal + val.slice(chunkIndex) + "'";
	}

	return "'" + escapedVal + "'";
}

module.exports = (config) => {
	var src = config.projectRoot + '/UI/Source';
	
	// Collect locale.json files:
	walk(src, (err, localeFiles) => {
		
		var keyCount = 0;
		var sql = '';
		
		for(var i=0;i<localeFiles.length;i++){
			var localeInfo = localeFiles[i];
			var content = fs.readFileSync(localeInfo.path);
			var loadedContent;
			
			try{
				loadedContent = JSON.parse(content);
			}catch(e){
				console.log("JSON parse error in '" + localeInfo.path + "'");
				console.error(e);
				return;
			}
			
			var currentDate = new Date();
			var now = currentDate.getFullYear() + '-' + pad(currentDate.getMonth()+1) + '-' + pad(currentDate.getDate()) + ' ' + pad(currentDate.getHours()) + ':' + pad(currentDate.getMinutes()) + ':' + pad(currentDate.getSeconds());
			var module = localeInfo.module;
			
			for(var key in loadedContent){
				var escaped = sqlEscape(key);
				keyCount++;
				sql += 'insert into site_translation(`UserId`,`Revision`,`CreatedUtc`,`EditedUtc`,`Module`,`Original`,`Translated`) values (0,1,\'' + now + '\',\'' + now + '\',' + sqlEscape(module) + ',' + escaped + ',' + escaped + ');\r\n'
			}
		}
		
		var fPath = config.projectRoot + '/translations.sql';
		fs.writeFileSync(fPath, sql, {encoding: 'utf8'});
		console.log('Wrote ' + keyCount + ' entries to ' + fPath);
	}, 'UI');
	
};