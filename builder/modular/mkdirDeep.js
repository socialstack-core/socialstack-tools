var fs = require('fs');
var path = require('path');

module.exports = function(pathname) {
	let paths = pathname.split(path.sep);
	for (let i = 1; i <= paths.length; i++) {
		let dirpath = path.join.apply(path, paths.slice(0, i));
		!fs.existsSync(dirpath) && fs.mkdirSync(dirpath);
	}
};