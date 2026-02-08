//create websocket
export function createWebsocket(url, opts={}) {

	//format url
	url = url.replace(/^http/i, 'ws');

	//format opts
	opts = Object.assign({
		protocols: [],
		retries: 50,
		wait: 2000,
		open: true
	}, opts);

	//local vars
	var conn = false;
	var tries = 0;
	var guid = 0;
	var listenQ = {}
	var sendQ = []
	var subbed = {};

	//update listener queue
	var updateListenQ = function(listener, event='message', channel=null, remove=false) {
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

	//public api
	const api = {
	
		ws: null,

		open: function() {
			//create socket?
			if(!api.ws) {
				//create socket
				api.ws = new WebSocket(url, opts.protocols);
				//open listener
				api.ws.addEventListener('open', function(e) {
					//update vars
					sendQ = [];
					conn = true;
					//get queue
					var q = sendQ;
					//loop through send queue
					for(var i=0; i < q.length; i++) {
						api.send(...q[i]);
					}
					//open queue
					runListenQ('open', e);
				});
				//message listener
				api.ws.addEventListener('message', function(e) {
					//message queue
					runListenQ('message', e);
					//process custom events
					for(var key in listenQ) {
						//has property?
						if(!listenQ.hasOwnProperty(key)) {
							continue;
						}
						//run queue?
						if(![ 'open', 'message', 'error', 'close' ].includes(key)) {
							runListenQ(key, e);
						}
					}
				});
				//error listener
				api.ws.addEventListener('error', function(e) {
					runListenQ('error', e);
				});
				//close listener
				api.ws.addEventListener('close', function(e) {
					//reset socket
					api.ws = null;
					conn = false;
					subbed = {};
					//close queue
					runListenQ('close', e);
					//stop here?
					if(e.code === 1000 || (tries > 0 && tries >= opts.retries)) {
						return;
					}
					//try to reconnect
					setTimeout(function() {
						tries++;
						api.open();
					}, opts.wait);
				});
			}
			//return
			return api;
		},

		close: function(code=1000, reason='') {
			//close connection?
			if(api.ws) {
				api.ws.close(code, reason);
				api.ws = null;
			}
			//return
			return api;
		},

		send: function(data, opts={}) {
			//can send?
			if(conn) {
				api.ws.send(opts.encode ? JSON.stringify(data) : data);
			}
			//de-dupe queue
			sendQ = sendQ.filter(function(item) {
				return item[0] !== data;
			});
			//add to queue?
			if(!conn || opts.queue) {
				sendQ.push([ data, opts ]);
			}
			//return
			return api;
		},

		on: function(event, listener) {
			updateListenQ(listener, event);
			return api;
		},

		off: function(event, listener) {
			updateListenQ(listener, event, null, true);
			return api;
		},

		trigger: function(event, data) {
			return api.send({
				event: event,
				data: data
			}, {
				encode: true
			});
		},

		subscribe: function(channel, listener, remove=false) {
			//update listener queue
			updateListenQ(listener, 'publish', channel, remove);
			//send message to server?
			if(!subbed[channel]) {
				//update flag
				subbed[channel] = true;
				//send now
				api.send({
					event: 'subscribe',
					channel: channel
				}, {
					encode: true,
					queue: !remove
				});
			}
			//return
			return api;
		},

		unsubscribe: function(channel, listener) {
			return api.subscribe(channel, listener, true);
		},

		publish: function(channel, data) {
			return api.send({
				event: 'publish',
				channel: channel,
				data: data
			}, {
				encode: true
			});
		}

	};

	//open now?
	if(opts.open) {
		api.open();
	}

	//close gracefully
	globalThis.addEventListener('beforeunload', function(e) {
		api.close();
	});

	//return
	return api;

}