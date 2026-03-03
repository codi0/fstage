//imports
import { nestedKey } from '../utils/index.mjs';
import { fetchHttp, formatUrl } from '../http/index.mjs';

//is default helper
function isDefault(val) {
	return val === null || val === undefined;
}

//parse key helper
function parseKey(key) {
	var res = {
		base: '',
		sub: '',
		org: key
	};
	var arr = key.split('.');
	if (arr.length) {
		res.base = arr.shift();
		res.sub = arr.join('.');
	}
	return res;
}

//create sync manager
export function createSyncManager(config={}) {

	//config defaults
	config = Object.assign({
		queueKey: 'remoteQueue',
		interval: 30000
	}, config);

	//create queue
	var queue = [];

	//remote handler
	config.remoteHandler = config.remoteHandler || {

		read: function(uri, opts={}) {
			//format uri
			uri = formatUrl(uri, opts.params || {});
			//make request
			return fetchHttp(uri, opts).then(function(response) {
				//extract data path?
				if (opts.resDataPath) {
					response = response[opts.resDataPath];
				}
				//key array by field into object?
				//e.g. resKeyPath: 'id' converts [{id:'1',...}] ? {'1':{...}}
				if (opts.resKeyPath && Array.isArray(response)) {
					response = Object.fromEntries(
						response.map(function(item) {
							return [ item[opts.resKeyPath], item ];
						})
					);
				}
				//return
				return response;
			});
		},

		write: function(uri, payload, opts={}) {
			//set body?
			if (payload) {
				if (opts.reqDataPath) {
					opts.body = nestedKey(opts.body || {}, opts.reqDataPath, { val: payload });
				} else {
					opts.body = opts.body || payload;
				}
			}
			//is delete?
			if (payload === undefined) {
				opts.method = opts.method || 'DELETE';
			}
			//make request
			return this.read(uri, opts);
		}

	};

	//local handler
	config.localHandler = config.localHandler || {

		read: function(key, opts={}) {
			var keyObj = parseKey(key);
			return new Promise(function(resolve) {
				var res = localStorage.getItem(keyObj.base);
				try {
					res = JSON.parse(res);
				} catch(err) {
					//do nothing
				}
				if (keyObj.sub) {
					res = nestedKey(res || {}, keyObj.sub);
				}
				resolve(res);
			});
		},

		write: function(key, payload, opts={}) {
			var that = this;
			var keyObj = parseKey(key);
			return new Promise(function(resolve) {
				var prom = Promise.resolve(payload);
				//has subkey?
				if (keyObj.sub) {
					prom = that.read(keyObj.base, opts).then(function(data) {
						return nestedKey(data || {}, keyObj.sub, { val: payload });
					});
				}
				//continue
				return prom.then(function(data) {
					if (isDefault(data)) {
						localStorage.removeItem(keyObj.base);
					} else {
						localStorage.setItem(keyObj.base, JSON.stringify(data));
					}
					resolve(nestedKey(data || {}, keyObj.sub));
				});
			});
		}

	};

	//public api
	const api = {

		local:  config.localHandler,
		remote: config.remoteHandler,

		isOnline() {
			return !!(globalThis.navigator && ('onLine' in navigator) && navigator.onLine);
		},

		read: function(key, opts={}) {
			opts = Object.assign({
				default: null,
				retry:   false,
				refresh: false,
				cache:   true,
				local:   {},
				remote:  {}
			}, opts);

			//read local first
			var prom = api.local.read(key, opts.local);

			prom = prom.then(function(res) {
				//call remote if no local data or refresh requested
				if (opts.remote.uri && (opts.refresh || isDefault(res))) {
					var remote = new Promise(function(resolve) {
						api.remote.read(opts.remote.uri, opts.remote).then(function(res) {
							resolve(res);
							opts.resolve && opts.resolve(res);
						}).catch(function(err) {
							opts.resolve = resolve;
							console.error('Remote read failed', err);
							api.addQueue('read', [ key, opts ]);
						});
					});

					//cache remote result locally and re-read
					if (opts.cache) {
						prom.next = remote.then(function(res) {
							return api.local.write(key, res, opts.local).then(function() {
								delete opts.remote.uri;
								return api.read(key, opts);
							});
						});
					}
				}

				//fall back to default if nothing found
				if (isDefault(res)) {
					res = opts.default;
				}

				return res;
			});

			return prom;
		},

		write: function(key, payload, opts={}) {
			opts = Object.assign({
				retry:  false,
				local:  {},
				remote: {}
			}, opts);

			//retry reads from local rather than re-writing
			var prom = opts.retry
				? api.local.read(key, opts.local)
				: api.local.write(key, payload, opts.local);

			prom = prom.then(function(payload) {
				if (opts.remote.uri) {
					var remote = new Promise(function(resolve) {
						api.remote.write(opts.remote.uri, payload, opts.remote).then(function(response) {
							//write server-assigned ID back to local if provided
							if (opts.remote.resIdPath) {
								var id = nestedKey(response, opts.remote.resIdPath);
								if (id) {
									payload[opts.remote.resIdPath.split('.').pop()] = id;
									api.local.write(key, payload, opts.local);
								}
							}
							resolve(payload);
						}).catch(function(err) {
							console.error('Remote write failed', err);
							//queue for retry when back online.
							//note: local write already succeeded above — this is optimistic UI.
							//the store sees success immediately; remote sync happens later.
							api.addQueue('write', [ key, null, opts ]);
							return null;
						});
					});

					prom.next = remote;
				}

				return payload;
			});

			return prom;
		},

		addQueue: function(method, args=[]) {
			//skip if already queued for this key
			for (var i=0; i < queue.length; i++) {
				if (method === queue[i].method && args[0] === queue[i].args[0]) {
					return false;
				}
			}
			//mark as retry so write() reads from local rather than re-writing
			args[args.length-1].retry = true;
			queue.push({ method, args });
		},

		processQueue: function() {
			if (!api.isOnline()) return;
			while (queue.length) {
				var item = queue.shift();
				api[item.method](...item.args);
			}
		}

	};

	//load persisted queue from last session
	api.local.read(config.queueKey).then(function(res) {
		queue = res || [];
		api.local.write(config.queueKey, undefined);
		api.processQueue();
	});

	//persist write queue across page unloads (reads are not worth retrying)
	globalThis.addEventListener('beforeunload', function() {
		queue = queue.filter(function(item) {
			return item.method !== 'read';
		});
		api.local.write(config.queueKey, queue.length ? queue : undefined);
	});

	//retry queue on a timer
	setInterval(function() {
		api.processQueue();
	}, config.interval);

	//retry queue immediately when coming back online
	globalThis.addEventListener('online', function() {
		api.processQueue();
	});

	return api;

}