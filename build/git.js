var exec = require('child_process').exec;

function gitSync(branch, repoPath){
	return execGitCommand('git pull', repoPath)
	.then(() => execGitCommand('git reset --hard ' + branch, repoPath));
}

function execGitCommand(cmd, repoPath){
	return new Promise((s, r)=>{
		exec(cmd, {
			cwd: repoPath
		}, function(err, stdout, stderr){
			
			if(err || stderr){
				console.log(err);
				
				if(stderr){
					console.log(stderr);
				}
				r();
				return;
			}
			
			if(stdout){
				console.log(stdout);
			}
			
			s();
		});
	});
	
}

module.exports = {gitSync};