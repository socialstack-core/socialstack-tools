var { installDatabase } = require('../create/helpers.js');

module.exports = (config) => {
	
	installDatabase(config).then(() => {
		console.log('Done');
	}).catch(e => {
		
		if(e && e.message){
			console.error(e.message);
		}else{
			console.error(e);
		}
		
	});
	
};