var exec = require('child_process').exec;

module.exports = (config) => {
	
	// Just a basic "upgrade all submodules" for now:
	// - Needs to of course be considerate for custom submodules in a project, as well as just be faster.
	//   This command does each module one at a time, and can take a few minutes, vs. having some index of latest commit hashes.
	return runCmd('git submodule foreach git pull origin master', config);
	
};

function runCmd(cmd, config){
	return new Promise((success, reject) => {
		
		var proc = exec(
			cmd,
			{
				cwd: config.projectRoot
			},
			function(err, stdout, stderr){
				if(err){
					// Fail:
					reject(err);
					return;
				}
				
				success(stdout);
			}
		);
		
		proc.stdout.pipe(process.stdout);
		proc.stderr.pipe(process.stderr);
	});
}
