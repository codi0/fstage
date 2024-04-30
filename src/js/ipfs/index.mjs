//create proxy
var createProxy = function(obj, opts = {}) {

	//format opts
	opts = Object.assign({
		path: '',
		blacklist: [],
		beforeMethod: {},
		afterMethod: {}
	}, opts);

	//get listeners
	var getListeners = function(type, path) {
		return (opts[type]['*'] || []).concat(opts[type][path] || []);
	};

	//proxy handler
	var proxyHandler = {

		get: function(target, prop) {
			//get full path
			var propPath = opts.path + prop;
			//is proxy?
			if(prop === '__isProxy') {
				return true;
			}
			//extension method?
			if([ 'beforeMethod', 'afterMethod' ].includes(propPath)) {
				//create function
				return function(event, fn) {
					//to array?
					if(typeof event === 'string') {
						event = event.split(',');
					}
					//loop through event names
					event.forEach(function(e) {
						e = e.trim();
						opts[propPath][e] = opts[propPath][e] || [];
						opts[propPath][e].push(fn);
					});
				};
			}
			//stop here?
			if(opts.blacklist.includes(propPath)) {
				//reset path
				opts.path = '';
				//return
				return target[prop];
			}
			//object?
			if(typeof target[prop] === 'object') {
				//add to parent path
				opts.path += prop + '.';
				//wrap in proxy?
				if(target[prop] && target === obj) {
					//is already proxy?
					if(!target[prop].__isProxy) {
						target[prop] = new Proxy(target[prop], proxyHandler);
					}
				}
				//return
				return target[prop];
			}
			//reset path
			opts.path = '';
			//function?
			if(typeof target[prop] === 'function') {
				//create function
				return function(...args) {
					//set vars
					var running = true;
					//call before method
					getListeners('beforeMethod', propPath).forEach(function(fn) {
						//run callback?
						if(running) {
							args = fn(args);
						}
						//stop here?
						if(args === false) {
							running = false;
						}
					});
					//continue?
					if(running) {
						//call method
						var result = target[prop](...args);
						//after callbacks
						var after = function(result) {
							//call after method
							getListeners('afterMethod', propPath).forEach(function(fn) {
								result = fn(result, args);
							});
							//return
							return result;
						};
						//is promise?
						if(result.then) {
							return result.then(after);
						} else {
							return after(result);
						}
					}
				}
			}
			//property
			return target[prop];
		}

	};

	//return
	return new Proxy(obj, proxyHandler);

};

//convert to string
var toString = function(data) {
	//has buffer?
	if(data && data.buffer) {
		//use text decoder?
		if(data.buffer instanceof ArrayBuffer) {
			return new TextDecoder().decode(data);
		}
	}
	//has toString?
	if(data && data.toString) {
		return data.toString();
	}
	//return
	return data || '';
};

//is async iterator
var isAsyncIterator = function(fn) {
	return fn && fn[Symbol.asyncIterator];
};

//is async generator
var isAsyncGenerator = function(fn) {
	return fn && fn.constructor && fn.constructor.constructor && fn.constructor.constructor.name == 'AsyncGeneratorFunction';
};

//get opts
var getOpts = function(args) {
	//set vars
	var opts = args[args.length-1];
	//format opts?
	if(!opts || typeof opts !== 'object') {
		opts = {};
	}
	//return
	return opts;		
};

//run iterator
var runIterator = function(iterator, opts = {}) {
	//set defaaults
	opts = Object.assign({
		chunks: [],
		buffer: 0,
		output: 'iterator'
	}, opts);
	//return iterator?
	if(opts.output === 'iterator') {
		return iterator;
	}
	//is generator?
	if(!isAsyncGenerator(iterator)) {
		iterator = iterator[Symbol.asyncIterator]();
	}
	//run next loop
	return iterator.next().then(function(result) {
		//process value?
		if(result.value) {
			//cache chunk
			opts.chunks.push(result.value);
			//is object?
			if(result.value.length) {
				opts.buffer += result.value.length;
			} else {
				opts.output = 'buffer';
			}
		}
		//another loop?
		if(!result.done) {
			return runIterator(iterator, opts);
		}
		//format data
		var offset = 0;
		var data = opts.chunks;
		//create array buffer?
		if(opts.buffer > 0) {
			//set buffer length
			data = new Uint8Array(opts.buffer);
			//populate buffer view
			for(var i=0; i < opts.chunks.length; i++) {
				data.set(opts.chunks[i], offset);
				offset += opts.chunks[i].length;
			}
		}
		//to string?
		if(opts.output === 'string') {
			data = toString(data);
		}
		//return
		return data;
	});
};

//exports
export default function ipfs(config = {}, ctx = 'node') {

	//create cache?
	if(!ipfs.instances) {
		ipfs.instances = {};
	}
		
	//format config?
	if(typeof config === 'string') {
		config = { repo: config };
	}

	//contexts
	var contexts = {
		isNode: (typeof global !== 'undefined'),
		node: {
			prefix: '',
			node: 'ipfs',
			browser: 'https://cdn.jsdelivr.net/npm/ipfs/dist/index.min.js',
			global: 'Ipfs'
		},
		http: {
			prefix: 'http.',
			node: 'ipfs-http-client',
			browser: 'https://cdn.jsdelivr.net/npm/ipfs-http-client/dist/index.min.js',
			global: 'IpfsHttpClient'
		}
	};

	//config defaults
	config = Object.assign({
		repo: 'ipfs'
	}, config);

	//add repo prefix?
	if(contexts[ctx].prefix) {
		config.repo = contexts[ctx].prefix + config.repo;
	}

	//return from cache?
	if(ipfs.instances[config.repo]) {
		return ipfs.instances[config.repo];
	}

	//import lib?
	if(globalThis[contexts[ctx].global]) {
		var prom = Promise.resolve(globalThis[contexts[ctx].global]);
	} else {
		var prom = import(contexts[ctx][contexts.isNode ? 'node' : 'browser']);
	}
	
	//wait for promise
	return prom.then(function(Ipfs) {

		//use global?
		if(!Ipfs || !Ipfs.create) {
			Ipfs = globalThis[contexts[ctx].global];
		}

		//attach ipfs?
		if(!ipfs.orig || ctx === 'node') {
			ipfs.orig = Ipfs;
		}

		//create instance
		ipfs.instances[config.repo] = Promise.resolve(Ipfs.create(config)).then(function(node) {

			//is file method
			node.files.isFile = function(path, type='file') {
				return node.files.stat(path).then(function(result) {
					return (result.type == type);
				});
			};

			//is dir method
			node.files.isDir = function(path) {
				return node.files.isFile(path, 'directory');
			};

			//skip proxy?
			if(config.skipProxy) {
				return node;
			}

			//create root proxy
			var api = createProxy(node);

			//global: before method
			api.beforeMethod('*', function(args) {
				//cid to string
				args[0] = toString(args[0]);
				//return
				return args;
			});

			//global: after method
			api.afterMethod('*', function(result, args) {
				//is async iterator?
				if(isAsyncIterator(result)) {
					result = runIterator(result, getOpts(args));
				}
				//return
				return result;
			});	

			//files.write: before method
			api.beforeMethod('files.write', function(args) {
				//set defaults
				args[2] = Object.assign({
					create: true
				}, args[2] || {});
				//return
				return args;
			});

			//files.write: after method
			api.afterMethod('files.write', function(result, args) {
				//use stat?
				if(getOpts(args).stat) {
					result = api.files.stat(args[0]);
				}
				//return
				return result;
			});

			//return
			return api;

		});

		//return
		return ipfs.instances[config.repo];

	});

};

//create node
ipfs.node = function(config = {}) {
	return ipfs(config, 'node');
};

//create http client
ipfs.httpClient = function(config = {}) {
	return ipfs(config, 'http');
};

//set globals?
if(globalThis.Fstage) {
	Fstage.ipfs = ipfs;
}