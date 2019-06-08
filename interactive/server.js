module.exports = (config) => {
	/*
	* This little TCP server receives JSON messages with a small binary header.
	* The JSON messages are then used to e.g. start a UI file watcher or
	* render some react.
	*/
	
	var server = require('net').createServer(function(socket) {
		
		/*
		* Sends a response to the given request ID.
		*/
		function response(msg, requestId){
			
			var payload = Buffer.from(JSON.stringify(msg));
			
			// Send header:
			socket.write(Buffer.from([
				1,
				payload.length & 255,
				(payload.length >> 8) & 255,
				(payload.length >> 16) & 255,
				(payload.length >> 24) & 255,
				requestId & 255,
				(requestId >> 8) & 255
			]));
			
			// Send payload:
			socket.write(payload);
			
		}
		
		var currentBuffer = null;
		
		socket.on('data', function(chunk){
			
			if(socket.bufferQueue){
				// Chunk joins the queue or flushes it.
				socket.bufferQueue.pending -= chunk.length;
				
				socket.bufferQueue.buffers.push(chunk);
				
				if(socket.bufferQueue.pending > 0){
					// Need more data - wait for next chunk.
					return;
				}
				
				// Got enough data to proceed. Now we'll act like we received one large chunk.
				chunk = Buffer.concat(socket.bufferQueue.buffers);
				
				socket.bufferQueue = null;
			}
			
			var offset = 0;
			
			while (offset < chunk.length) {
			
				if (chunk.length < offset + 7) {
					// data not enough for parsing header.
					// Push this partial data chunk into the queue:
					this.bufferQueue = {
						pending: 7,
						buffers: [
							chunk
						]
					};
					break;
				}
				
				let opcode = chunk[offset];
				let payloadSize = (chunk[offset + 1]) | (chunk[offset + 2] << 8) | (chunk[offset + 3] << 16) | (chunk[offset + 4] << 24);
				let requestId = (chunk[offset + 5]) | (chunk[offset + 6] << 8);
				
				 if ((offset + 7 + payloadSize) > chunk.length) {
					// Not enough data to parse the actual chunk body. 
					// Add to queue until we have received at least the required amount (including the chunk header).
					var firstBuffer = chunk.slice(offset);
					
					this.bufferQueue = {
						pending: offset + 7 + payloadSize - firstBuffer.length,
						buffers:[
							firstBuffer
						]
					};
					
					break;
				}
				
				offset+=7;
				var requestMessage;
				
				try{
					requestMessage = JSON.parse(chunk.slice(offset, offset + payloadSize).toString());
				}catch(e){
					// The client has probably gone out of sync. Kill the link (and not our process!)
					console.log(e);
					socket.close();
					return;
				}
				
				offset+=payloadSize;
				var _responded = false;
				try{
					
					// handle the request now:
					config.onRequest({
						request: requestMessage,
						response: function(message){
							_responded = true;
							response(message, requestId);
						}
					});
					
				}catch(e){
					console.log(e);
					
					if(!_responded){
						// Make sure we always provide a response:
						response({error: e.toString()}, requestId);
					}
				}
			}
			
		});
		
		socket.on('close', function(){
			// They disconnected - terminate now:
			server.close();
		});
		
	});
	
	server.listen(config.port, 'localhost', function(){
		// This special message informs the end client that we're ready to be connected to:
		console.log('[NodeReadyForConnections]');
	});
	
};