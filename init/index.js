var { installDatabase } = require('../create/helpers.js');

module.exports = (config) => {
	
	installDatabase(config).then(() => {
		console.log('Done');
	});
	
};