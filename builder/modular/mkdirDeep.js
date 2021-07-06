var fs = require('fs');
var path = require('path');

module.exports = function(pathname) {
	pathname = path.resolve(pathname);
	let paths = pathname.split(path.sep);
	for (let i = 1; i < paths.length; i++) {
		let dirpath = paths.slice(0, i+1).join(path.sep);
		!fs.existsSync(dirpath) && fs.mkdirSync(dirpath);
	}
};