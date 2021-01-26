const fs = require('fs');

module.exports = (config) => {
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	
	// divert all error messages into stdout:
	console.error = console.log;
	
	// If we're given a lockfile to check, we'll check if it's still locked regularly. The moment it is not locked, we terminate.
	if(config.lockfile){
		setInterval(function(){
			
			// Does the lockfile exist, and can we open it?
			// If both are true, the host process is still up.
			
			var readStream = fs.createReadStream(config.lockfile);
			
			readStream.on('open', function () {
				// The lockfile is no longer locked, but we're still up. Halt now.
				console.log('UI watcher is exiting as lockfile is no longer locked by host process.');
				process.exit(0);
			});
			
			readStream.on('error', function(err) {
				if(err.code == 'EBUSY'){
					// Lockfile is successfully locked. Do nothing.
				}else{
					console.log('UI watcher is exiting as lockfile either did not exist or had an unknown error. ', err);
					process.exit(0);
				}
			});
			
			// process.exit(0);
			
		}, 2000);
	}
	
	process.stdin.on('data', function(chunk) {
		var requestMessage;
		
		try{
			requestMessage = JSON.parse(chunk.toString());
		}catch(e){
			console.log(e);
			return;
		}
		
		var id = requestMessage._id;
		
		var _responded = false;
		try{
			
			// handle the request now:
			config.onRequest({
				request: requestMessage,
				response: function(message){
					_responded = true;
					response(message, id);
				}
			});
		}catch(e){
			console.log(e);
			
			if(!_responded){
				// Make sure we always provide a response:
				response({error: e.toString()}, id);
			}
		}
		
	});
	
	/*
	* Sends a response to the given request ID.
	*/
	function response(msg, id){
		if(!msg){
			msg = {};
		}
		msg._id = id;
		console.log(JSON.stringify(msg));
	}
	
};