//exports
export default function websocket(url, opts = {}, isObj = false) {

	//create obj?
	if(isObj !== true) {
		return new websocket(url, opts, true);
	}

	//format opts
	opts = Object.assign({
		protocols: [],
		retries: 50,
		wait: 2000
	}, opts);

	//set vars
	var self = this, conn = false, tries = 0, guid = 0, listenQ = {}, sendQ = [], subbed = {};

	//update listener queue
	var updateListenQ = function(listener, event = 'message', channel = null, remove = false) {
		//event queue
		listenQ[event] = listenQ[event] || [];
		//de-dupe queue
		listenQ[event] = listenQ[event].filter(function(item) {
			return item.listener !== listener || item.channel !== channel;
		});
		//add to queue?
		if(!remove) {
			listenQ[event].push({ listener: listener, channel: channel });
		}
	};

	//run listen queue
	var runListenQ = function(event, e) {
		//loop through listeners
		for(var i=0; i < (listenQ[event] || []).length; i++) {
			//set vars
			var json, opts = listenQ[event][i];
			//raw socket?
			if(!event || [ 'open', 'message', 'error', 'close' ].includes(event)) {
				return opts.listener(e);
			}
			//parse data?
			try {
				json = JSON.parse(e.data);
			} catch (Ex) {
				//do nothing
			}
			//event matched?
			if(!json || json.event !== event) {
				return;
			}
			//channel matched?
			if(!opts.channel || json.channel === opts.channel) {
				opts.listener(json.data || json.message || json, e);
			}
		}
	};

	//open
	self.open = function() {
		//has socket?
		if(self.ws) return;
		//create socket
		self.ws = new WebSocket(url.replace(/^http/i, 'ws'), opts.protocols);
		//onOpen listener
		self.ws.addEventListener('open', function(e) {
			//set vars
			var q = sendQ; sendQ = []; conn = true;
			//loop through send queue
			for(var i=0; i < q.length; i++) {
				self.send.apply(self, q[i]);
			}
			//open queue
			runListenQ('open', e);
		});
		//onMessage listener
		self.ws.addEventListener('message', function(e) {
			//message queue
			runListenQ('message', e);
			//process custom events
			for(var event in listenQ) {
				//run queue?
				if(listenQ.hasOwnProperty(event) && ![ 'open', 'message', 'error', 'close' ].includes(event)) {
					runListenQ(event, e);
				}
			}
		});
		//onError listener
		self.ws.addEventListener('error', function(e) {
			runListenQ('error', e);
		});
		//onClose listener
		self.ws.addEventListener('close', function(e) {
			//reset socket
			self.ws = null; conn = false; subbed = {};
			//close queue
			runListenQ('close', e);
			//stop here?
			if(e.code === 1000 || (tries > 0 && tries >= opts.retries)) {
				return;
			}
			//try to reconnect
			setTimeout(function() {
				tries++; self.connect();
			}, opts.wait);
		});
		//chain it
		return self;
	};

	//close
	self.close = function(code = 1000, reason = '') {
		//close connection?
		self.ws && self.ws.close(code, reason);
		//chain it
		return self;
	};

	//send
	self.send = function(data, opts = {}) {
		//can send now?
		conn && self.ws.send(opts.encode ? JSON.stringify(data) : data);
		//de-dupe queue
		sendQ = sendQ.filter(function(item) {
			return item[0] !== data;
		});
		//add to queue?
		if(!conn || opts.queue) {
			sendQ.push([ data, opts ]);
		}
		//chain it
		return self;
	};

	//on
	self.on = function(event, listener) {
		updateListenQ(listener, event);
		return self;
	};

	//off
	self.off = function(event, listener) {
		updateListenQ(listener, event, null, true);
		return self;
	};

	//trigger
	self.trigger = function(event, data) {
		return self.send({ event: event, data: data }, { encode: true });
	};

	//subscribe
	self.subscribe = function(channel, listener, remove = false) {
		//update listener queue
		updateListenQ(listener, 'publish', channel, remove);
		//send message to server?
		if(!subbed[channel]) {
			self.send({ event: 'subscribe', channel: channel }, { encode: true, queue: !remove });
			subbed[channel] = true;
		}
		//chain it
		return self;
	}

	//unsubscribe
	self.unsubscribe = function(channel, listener) {
		return self.sub(channel, listener, true);
	};

	//publish
	self.publish = function(channel, data) {
		return self.send({ event: 'publish', channel: channel, data: data }, { encode: true });
	}

	//close gracefully
	globalThis.addEventListener('beforeunload', function(e) {
		self.close();
	});

	//open socket
	return self.open();

}