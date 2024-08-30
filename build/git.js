var exec = require('child_process').exec;

function gitSync(branch, repoPath){
	return execGitCommand('git reset --hard ' + branch, repoPath)
	.then(() => execGitCommand('git pull', repoPath));
}

function execGitCommand(cmd, repoPath){
	return new Promise((s, r)=>{
		exec(cmd, {
			cwd: repoPath
		}, function(err, stdout, stderr){
			
			if(err){
				console.log(err);
			}else{
				if(stdout){
					console.log(stdout);
				}
				if(stderr){
					console.log(stderr);
				}
			}
			
			s(cfg);
		});
	});
	
}

module.exports = {gitSync};