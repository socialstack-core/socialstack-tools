var fs = require('fs');
var path = require('path');

module.exports = function(pathname) {
	let paths = pathname.split(path.sep);
	for (let i = 2; i <= paths.length; i++) {
		let dirpath = paths.slice(0, i).join(path.sep);
		!fs.existsSync(dirpath) && fs.mkdirSync(dirpath);
	}
};