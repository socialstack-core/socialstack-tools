module.exports = (config) => {
	/*
	* Connects to a TCP server on localhost and send/ receives JSON messages with a small binary header.
	* The JSON messages are then used to e.g. start a UI file watcher or
	* render some react.
	*/
	
	var net = require('net');
	
	var socket = new net.Socket();
	var timeout = null;
	var lastMessageTime = 0;
	var remoteVersion = 0;
	
	
	var heartbeatPayload = Buffer.from([
		2,
		0,
		0,
		0,
		0,
		0,
		0
	]);
	
	socket.connect(config.port, '127.0.0.1', function() {
		console.log('Socialstack interactive client connected to host at port ' + config.port);
		
		if(!timeout){
			timeout = setInterval(function(){
				
				if (remoteVersion >= 1 && lastMessageTime != 0) {
					// 4 seconds ago is the limit.
					if (lastMessageTime <= (Date.now() - 1000 * 4)) {
						if(socket){
							socket.end();
							socket = null;
						}
						process.exit();
						return;
					}
				}
				
				// Heartbeat.
				// This may cause the socket to error or disconnect, 
				// resulting in our process exiting intentionally.
				socket.write(heartbeatPayload);
				
			}, 2000);
		}
		
		var id = config.id || 1;
		
		socket.write(Buffer.from([
			3,
			id & 255,
			(id >> 8) & 255,
			(id >> 16) & 255,
			(id >> 24) & 255,
			1,
			0
		]));
	});
	
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
			
			lastMessageTime = Date.now();
			
			if(opcode == 4){
				// Heartbeat responded! The main thing this does is update last message time.
				return;
			}else if(opcode == 5){
				// Protocol version msg:
				remoteVersion = requestId;
				return;
			}
			
			offset+=7;
			var requestMessage;
			
			try{
				requestMessage = JSON.parse(chunk.slice(offset, offset + payloadSize).toString());
			}catch(e){
				// The client has probably gone out of sync. Kill the link (and our process)
				console.log(e);
				process.exit();
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
	
	function quit(){
		console.log('Host connection failure - exiting');
		// They disconnected - terminate now:
		process.exit();
	}
	
	socket.on('close', quit);
	socket.on('end', quit);
	socket.on('error', quit);
};