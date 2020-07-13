module.exports = (config) => {
	process.stdin.resume();
	process.stdin.setEncoding('utf8');
	
	// divert all error messages into stdout:
	console.error = console.log;
	
	// If we're given a parent process, we'll check if it's still alive regularly:
	if(config.parent){
		setInterval(function(){
			// Oddity of the process API - using 0 checks if the process exists.
			try{
				process.kill(config.parent, 0);
			}catch(e){
				// Down we go! Take sibling processes with us if asked to do so.
				process.exit(0);
			}
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