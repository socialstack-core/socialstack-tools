const { spawn } = require('child_process');


async function runTests(config){
	await testAPI(config);
}

function testAPI(config){
	// Output into bin/Api/build by default (unless told otherwise)
	
	return new Promise((success, reject) => {
		
		//  dotnet publish Api.csproj -o obj/tm
		const child = spawn('dotnet', ['test', config.csProject, '--logger', 'console;verbosity=detailed'], {
			cwd: config.projectRoot
		});
		
		// Change encoding to text:
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		
		child.stdout.on('data', (chunk) => {
		  // data from standard output is here as buffers
		  console.log(chunk);
		});
		
		// since these are streams, you can pipe them elsewhere
		child.stderr.on('data', (chunk) => {
		  // data from standard output is here as buffers
		  console.log(chunk);
		});
		
		child.on('close', (code) => {
			if(!code){
				console.log('API test success');
				success();
			}else{
				reject('API test failed. See above for more details.');
			}
		});
	});
}

module.exports = {runTests};