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
			
			if(err){
				console.log(err);
				
				if(stderr){
					console.log(stderr);
				}
				
				r('Git command failed');
				return;
			}
			
			if(stdout){
				console.log(stdout);
			}
			
			if(stderr){
				console.log(stderr);
			}
			
			s();
		});
	});
	
}

module.exports = {gitSync};