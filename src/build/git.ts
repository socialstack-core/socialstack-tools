import { exec as exec } from 'child_process';

function gitSync(branch: string, repoPath: string){
	return execGitCommand('git fetch origin', repoPath)
	.then(() => execGitCommand('git reset --hard origin/' + branch, repoPath));
}

function execGitCommand(cmd: string, repoPath: string){
	return new Promise<void>((s, r)=>{
		exec(cmd, {
			cwd: repoPath
		}, function(err, stdout, stderr){
			
			if(err){
				console.log(err);
				
				if(stdout){
					console.log(stdout);
				}
				
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

export default {gitSync};