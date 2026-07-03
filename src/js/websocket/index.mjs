/**
 * Create a WebSocket connection with automatic reconnection, a send queue
 * (flushes on reconnect), and channel-based pub/sub helpers.
 *
 * The `http://` or `https://` scheme in `url` is automatically converted to
 * `ws://` / `wss://`. The connection is opened immediately unless
 * `opts.open: false` is passed.
 *
 * @param {string} url - WebSocket server URL (http/https schemes are accepted).
 * @param {Object} [opts]
 * @param {string[]} [opts.protocols=[]]  - Sub-protocols passed to `new WebSocket()`.
 * @param {number}   [opts.retries=50]    - Max reconnect attempts before giving up.
 * @param {number}   [opts.wait=2000]     - Ms to wait between reconnect attempts.
 * @param {boolean}  [opts.open=true]     - Open the connection immediately.
 *
 * @returns {{
 *   ws: WebSocket|null,
 *   open(): Object,
 *   close(code?: number, reason?: string): Object,
 *   send(data: *, opts?: Object): Object,
 *   on(event: string, listener: Function): Object,
 *   off(event: string, listener: Function): Object,
 *   trigger(event: string, data: *): Object,
 *   subscribe(channel: string, listener: Function): Object,
 *   unsubscribe(channel: string, listener: Function): Object,
 *   publish(channel: string, data: *): Object
 * }}
 *
 * All methods return the api instance for chaining.
 *
 * **`on(event, listener)`** — listen to raw socket events (`'open'`,
 * `'message'`, `'error'`, `'close'`) or custom JSON events by name.
 *
 * **`trigger(event, data)`** — send a `{ event, data }` JSON message.
 *
 * **`subscribe(channel, listener)`** — subscribe to a channel. Sends a
 * `{ event: 'subscribe', channel }` message to the server.
 *
 * **`publish(channel, data)`** — send a `{ event: 'publish', channel, data }`
 * message to the server.
 *
 * **`send(data, opts?)`** — send raw data. `opts.encode: true` JSON-stringifies
 * before sending. `opts.queue: true` re-queues even when connected.
 */
export function createWebsocket(url, opts={}) {

	url = url.replace(/^http/i, 'ws');

	opts = Object.assign({
		protocols: [],
		retries: 50,
		wait: 2000,
		open: true
	}, opts);

	var conn = false;
	var tries = 0;
	var guid = 0;
	var listenQ = {}
	var sendQ = []
	var subbed = {};

	var updateListenQ = function(listener, event='message', channel=null, remove=false) {
		listenQ[event] = listenQ[event] || [];
		listenQ[event] = listenQ[event].filter(function(item) {
			return item.listener !== listener || item.channel !== channel;
		});
		if(!remove) {
			listenQ[event].push({ listener: listener, channel: channel });
		}
	};

	var runListenQ = function(event, e) {
		var isRaw = !event || [ 'open', 'message', 'error', 'close' ].includes(event);
		var json = null;
		if(!isRaw && e && typeof e.data === 'string') {
			try {
				json = JSON.parse(e.data);
			} catch (Ex) {
				//do nothing
			}
		}
		for(var i=0; i < (listenQ[event] || []).length; i++) {
			var opts = listenQ[event][i];
			if(isRaw) {
				opts.listener(e);
				continue;
			}
			if(!json || json.event !== event) {
				continue;
			}
			if(!opts.channel || json.channel === opts.channel) {
				opts.listener(json.data || json.message || json, e);
			}
		}
	};

	const api = {
	
		ws: null,

		open: function() {
			if(!api.ws) {
					api.ws = new WebSocket(url, opts.protocols);
					api.ws.addEventListener('open', function(e) {
						var q = sendQ.slice();
						sendQ = [];
						conn = true;
						tries = 0;
						for(var i=0; i < q.length; i++) {
							api.send(...q[i]);
						}
					runListenQ('open', e);
				});
				api.ws.addEventListener('message', function(e) {
					runListenQ('message', e);
					// Custom events are encoded inside message frames.
					for(var key in listenQ) {
						if(!listenQ.hasOwnProperty(key)) {
							continue;
						}
						if(![ 'open', 'message', 'error', 'close' ].includes(key)) {
							runListenQ(key, e);
						}
					}
				});
				api.ws.addEventListener('error', function(e) {
					runListenQ('error', e);
				});
				api.ws.addEventListener('close', function(e) {
					api.ws = null;
					conn = false;
					subbed = {};
					runListenQ('close', e);
					// Normal close or exhausted retries stops reconnecting.
					if(e.code === 1000 || (tries > 0 && tries >= opts.retries)) {
						return;
					}
					setTimeout(function() {
						tries++;
						api.open();
					}, opts.wait);
				});
			}
			return api;
		},

		close: function(code=1000, reason='') {
			if(api.ws) {
				api.ws.close(code, reason);
				api.ws = null;
				conn = false;
			}
			return api;
		},

		send: function(data, opts={}) {
			if(conn) {
				api.ws.send(opts.encode ? JSON.stringify(data) : data);
			}
			sendQ = sendQ.filter(function(item) {
				return item[0] !== data;
			});
			if(!conn || opts.queue) {
				sendQ.push([ data, opts ]);
			}
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
				if(typeof listener === 'function') {
					updateListenQ(listener, 'publish', channel, remove);
				}
				if(!channel) {
					return api;
				}
				if(!remove && !subbed[channel]) {
					subbed[channel] = true;
					api.send({
						event: 'subscribe',
					channel: channel
					}, {
						encode: true,
						queue: true
					});
				}
				if(remove && subbed[channel]) {
					delete subbed[channel];
					api.send({
						event: 'unsubscribe',
						channel: channel
					}, {
						encode: true
					});
				}
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

	if(opts.open) {
		api.open();
	}

	if(typeof globalThis.addEventListener === 'function') {
		globalThis.addEventListener('beforeunload', function() {
			api.close();
		});
	}

	return api;

}
