//imports
import { nestedKey } from '../utils/index.mjs';
import { fetchHttp, formatUrl } from '../http/index.mjs';

//is default helper
function isDefault(val) {
	return val === null || val === undefined;
}

//parse key helper
function parseKey(key) {
	//set vars
	var res = {
		base: '',
		sub: '',
		org: key
	};
	//create array
	var arr = res ? key.split('.') : [];
	//set parts?
	if(arr.length) {
		res.base = arr.shift();
		res.sub = arr.join('.');
	}
	//return
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
	var queue = {};

	//remote handler
	config.remoteHandler = config.remoteHandler || {

		read: function(uri, opts={}) {
			//format uri
			uri = formatUrl(uri, opts.params || {});
			//make request
			return fetchHttp(uri, opts).then(function(response) {
				//update response?
				if(opts.resDataPath) {
					response = response[opts.resDataPath];
				}
				//return
				return response;	
			});
		},
		
		write: function(uri, payload, opts={}) {
			//set body?
			if(payload) {
				//set nested key?
				if(opts.reqDataPath) {
					opts.body = nestedKey(opts.body || {}, opts.reqDataPath, {
						val: payload
					});
				} else {
					opts.body = opts.body || payload;
				}
			}
			//is delete?
			if(payload === undefined) {
				opts.method = opts.method || 'DELETE';
			}
			//make request
			return this.read(uri, opts);
		}

	};

	//local handler
	config.localHandler = config.localHandler || {

		read: function(key, opts={}) {
			//set vars
			var keyObj = parseKey(key);
			//create promise
			return new Promise(function(resolve) {
				//get result
				var res = localStorage.getItem(keyObj.base);
				//decode?
				try {
					res = JSON.parse(res);
				} catch(err) {
					//do nothing
				}
				//has subkey?
				if(keyObj.sub) {
					res = nestedKey(res || {}, keyObj.sub);
				}
				//resolve
				resolve(res);
			});
		},
		
		write: function(key, payload, opts={}) {
			//set vars
			var that = this;
			var keyObj = parseKey(key);
			//create promise
			return new Promise(function(resolve) {
				//set promise
				var prom = Promise.resolve(payload);
				//has subkey?
				if(keyObj.sub) {
					prom = that.read(keyObj.base, opts).then(function(data) {
						return nestedKey(data || {}, keyObj.sub, {
							val: payload
						});
					});
				}
				//continue
				return prom.then(function(data) {
					//is delete?
					if(isDefault(data)) {
						localStorage.removeItem(keyObj.base);
					} else {
						//is array?
						if(Array.isArray(data)) {
							//max local ID
							var maxLocalId = 0;
							//find max local ID
							data.forEach(function(item) {
								if(item && item.__id && item.__id > maxLocalId) {
									maxLocalId = item.__id;
								}
							});
							//add missing local IDs
							data.forEach(function(item, index) {
								if(item && typeof item === 'object') {
									if(!item.__id) {
										item.__id = (++maxLocalId);
									}
								}
							});
						}
						//write to cache
						localStorage.setItem(keyObj.base, JSON.stringify(data));
					}
					//resolve
					resolve(nestedKey(data || {}, keyObj.sub));
				});
			});
		}

	};

	//public api
	const api = {
	
		local: config.localHandler,
		remote: config.remoteHandler,

		isOnline() {
			return !!(globalThis.navigator && ('onLine' in navigator) && navigator.onLine);
		},

		read: function(key, opts={}) {
			//default opts
			opts = Object.assign({
				default: null,
				retry: false,
				refresh: false,
				cache: true,
				local: {},
				remote: {}
			}, opts);
			//read local
			var prom = api.local.read(key, opts.local);
			//wait for promise
			prom = prom.then(function(res) {
				//call remote?
				if(opts.remote.uri && (opts.refresh || isDefault(res))) {
					//create promise
					var remote = new Promise(function(resolve) {
						//read remote
						api.remote.read(opts.remote.uri, opts.remote).then(function(res) {
							//resolve
							resolve(res);
							opts.resolve && opts.resolve(res);
						}).catch(function(err) {
							//cache resolver
							opts.resolve = resolve;
							//show error
							console.error('Remote read failed', err);
							//if fail, add to queue
							api.addQueue('read', [ key, opts ]);			
						});
					});
					//cache result?
					if(opts.cache) {
						//process result
						prom.next = remote.then(function(res) {
							//update local
							return api.local.write(key, res, opts.local).then(function() {
								//delete uri
								delete opts.remote.uri;
								//read new result
								return api.read(key, opts);
							});
						});
					}
				}
				//set default?
				if(isDefault(res)) {
					res = opts.default;
				}
				//return
				return res;
			});
			//return
			return prom;
		},
		
		write: function(key, payload, opts={}) {
			//default opts
			opts = Object.assign({
				retry: false,
				local: {},
				remote: {}
			}, opts);
			//set vars
			var prom = null;
			//is retry?
			if(opts.retry) {
				prom = api.local.read(key, opts.local);
			} else {
				prom = api.local.write(key, payload, opts.local);
			}
			//wait for promise
			prom = prom.then(function(payload) {
				//try remote?
				if(opts.remote.uri) {
					//create promise
					var remote = new Promise(function(resolve) {
						//call remote
						api.remote.write(opts.remote.uri, payload, opts.remote).then(function(response) {
							//look for ID key?
							if(opts.remote.resIdPath) {
								//search ID
								var id = nestedKey(response, opts.remote.resIdPath);
								//ID found?
								if(id) {
									payload[opts.remote.resIdPath.split('.').pop()] = id;
									api.local.write(key, payload, opts.local);
								}
							}
							//resolve
							resolve(payload);
						}).catch(function(err) {
							//show error
							console.error('Remote write failed', err);
							//if fail, add to queue
							api.addQueue('write', [ key, null, opts ]);
							//return
							return null;
						});
					});
					//add to promise
					prom.next = remote;
				}
				//return
				return payload;
			});
			//return
			return prom;
		},

		addQueue: function(method, args=[]) {
			//loop through array
			for(var i=0; i < queue.length; i++) {
				//matching method?
				if(method !== queue[i].method) {
					continue;
				}
				//matching key?
				if(args[0] === queue[i].args[0]) {
					return false;
				}
			}
			//mark as retry
			args[args.length-1].retry = true;
			//add to array
			queue.push({
				method: method,
				args: args
			});
		},

		processQueue: function() {
			//is offline?
			if(!api.isOnline()) {
				return;
			}
			//loop through queue
			while(queue.length) {
				//get item
				var item = queue.shift();
				//call method
				api[item.method](...item.args);
			}
		}

	};

	//load queue
	api.local.read(config.queueKey).then(function(res) {
		queue = res || [];
		api.local.write(config.queueKey, undefined);
		api.processQueue();
	});

	//save queue
	globalThis.addEventListener('beforeunload', function(e) {
		//filter queue
		queue = queue.filter(function(item) {
			return item.method !== 'read';
		});
		//update local
		api.local.write(config.queueKey, queue.length ? queue : undefined);
	});

	//process queue timer
	setInterval(function() {
		api.processQueue();
	}, config.interval);

	//process queue when back online
	globalThis.addEventListener('online', function(e) {
		api.processQueue();
	});

	//return
	return api;

}