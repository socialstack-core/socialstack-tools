var getAppDataPath = require('appdata-path');
var adp = getAppDataPath('socialstack');
var fs = require('fs');
var { runCmd } = require('../install/helpers.js');

module.exports = (config) => {
	
	var repoCheckout = adp + '/repositories/1';
	
	fs.mkdir(repoCheckout, { recursive: true }, (err) => {
		
		if (err && err.code != 'EEXIST') throw err;
		
		var repoExists = null;
		
		try{
			repoExists = fs.statSync(repoCheckout + '/.git');
		}catch{
		}
		
		var setupPromise = null;
		
		if(repoExists == null || !repoExists.isDirectory()){
			
			console.log("Looks like this is the first time - thank you! Cloning the main repository..");
			setupPromise = runCmd('git clone https://github.com/socialstack-core/modules.git/ "' + repoCheckout + '"', config);
			
		}else{
			
			console.log("Pulling the main repository..");
			setupPromise = runCmd('git pull', {projectRoot: repoCheckout});
			
		}
		
		setupPromise.then(() => {
			
			console.log("- Automated contribution available shortly! -");
			console.log("");
			console.log("A checkout has been made here: " + repoCheckout);
			console.log("Committing to this repository and pushing will then allow people to upgrade to pull in your changes.");
			
		});
		
	});
	
};