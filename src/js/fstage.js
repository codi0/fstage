(function() {

	/* CONFIG */

	var NAME = 'Fstage';
	var VERSION = '0.3.7';
	var GLOBALS = [ NAME, '$' ];
	var MODULES = [ 'fstage', 'utils', 'pubsub', 'observe', 'transport', 'form', 'dom/@all', 'app/@all', 'webpush', 'hls', 'ipfs' ];
	var DEFAULTS = [ 'fstage', 'app/@all' ];


	/* POLYFILLS */

	//globalThis
	if(typeof globalThis !== 'object') {
		Object.defineProperty(Object.prototype, '__magic__', {
			get: function() { return this },
			configurable: true
		});
		__magic__.globalThis = __magic__;
		delete Object.prototype.__magic__;
	}

	//Object.forEach
	if(!Object.prototype.forEach) {
		Object.defineProperty(Object.prototype, 'forEach', {
			writable: true,
			configurable: true,
			value: function(fn, thisArg) {
				for(var k in (this || {})) {
					if(this.hasOwnProperty(k)) {
						fn.call(thisArg, this[k], k, this);
					}
				}
			}
		});
	}

	//node global listener
	if(!globalThis.addEventListener && typeof __filename !== 'undefined') {
		//create global target
		var gTarget = new EventTarget();
		//custom event
		globalThis.CustomEvent = Event;
		//global dispatcher
		globalThis.dispatchEvent = function(e) {
			return gTarget.dispatchEvent(e);
		};
		//global listener
		globalThis.addEventListener = function(name, fn) {
			return gTarget.addEventListener(name, fn);
		};
	}


	/* BOOSTRAP */

	//env params
	var env = (function() {
		//Helper: format path
		var _formatPath = function(path) {
			var parts = path.split('?')[0].replace(/\/$/g, '').split('/');
			if(parts[parts.length-1].indexOf('.') !== -1) parts.pop();
			return parts.join('/') + '/';
		};
		//Helper: calc client ID
		var _calcId = function(ua, uid = '') {
			var str = uid + ua.replace(/[0-9\.\s]/g, '');
			var h = 5381, i = str.length;
			while(i) h = (h * 33) ^ str.charCodeAt(--i);
			return str ? (h >>> 0).toString() : '';
		};
		//Helper: parse user agent
		var _parseUa = function(ua) {
			//set vars
			var res = { clientOs: '', isMobile: false };
			var platforms = [ { o: 'android', m: true, r: 'Android' }, { o: 'ios', m: true, r: 'iPad|iPhone|watchOS' }, { o: 'ios', m: false, r: 'Macintosh' }, { o: 'windows', m: true, r: 'Windows Phone' }, { o: 'windows', m: false, r: 'Windows' } ];
			//test platforms
			platforms.some(function(el) {
				//user-agent match?
				if(ua.match(new RegExp(el.r, 'i'))) {
					res.clientOs = el.o;
					res.isMobile = !!el.m;
					return true;
				}
			});
			//return
			return res;
		};
		//base env
		var env = {
			//flags
			ready: false,
			isBrowser: false,
			isNode: false,
			isMobile: false,
			isWorker: false,
			isHybrid: !!globalThis._cordovaNative,
			isPwa: !!(globalThis.matchMedia && globalThis.matchMedia('(display-mode: standalone)').matches),
			//client
			clientId: '',
			clientOs: '',
			clientUa: globalThis.navigator ? navigator.userAgent : '',
			//server
			host: globalThis.location ? location.protocol + "//" + location.hostname : '',
			basePath: globalThis.location ? location.href : '',
			scriptPath: '',
			//nodejs
			parseReq: function(req) {
				env.host = (req.protocol || 'http') + "://" + req.headers.host;
				env.clientUa = req.headers['user-agent'];
				env.clientId = _calcId(env.clientUa);
				var p = _parseUa(env.clientUa);
				env.clientOs = p.clientOs;
				env.isMobile = p.isMobile;
			}
		};
		//check platform
		if(typeof __filename !== 'undefined') {
			env.isNode = true;
			env.scriptPath = __filename.replace(/\\/g, '/');
			env.basePath = process.cwd().replace(/\\/g, '/');
		} else if(typeof WorkerGlobalScope !== 'undefined') {
			env.isWorker = true;
		} else	if(typeof window !== 'undefined') {
			env.isBrowser = true;
			env.scriptPath = document.currentScript.src;
			env.basePath = (document.querySelector('base') || {}).href || env.basePath;
		}
		//format base uri
		env.basePath = _formatPath(env.basePath);
		//import template path
		env.importTpl = env.scriptPath.replace('/' + NAME.toLowerCase() + '.', '/{name}.').replace(/.js$/, '.mjs').replace('.min.', '.')
		//calculate client ID
		env.clientId = _calcId(env.clientUa);
		//detect client OS
		var p = _parseUa(env.clientUa);
		env.clientOs = p.clientOs;
		env.isMobile = p.isMobile;
		//return
		return env;
	})();

	//import handler
	var importr = function(path, opts = {}) {
		//bulk import?
		if(typeof path !== 'string') {
			//set vars
			var proms = [];
			//loop through modules
			path.forEach(function(m) {
				proms.push(importr(m, opts));
			});
			//return
			return Promise.all(proms);
		}
		//set vars
		var name = '';
		var parts = path.split('/');
		//is cachable?
		if(/^[a-zA-Z0-9\/\@]+$/.test(path)) {
			//set name
			name = path.replace(/(\/\@all|\/index)$/g, '');
			//update path
			path = path.replace(/\@all$/g, 'index');
			//add section?
			if(!(/\.|\//.test(path))) {
				path += '/' + parts[parts.length-1];
			}
		}
		//default opts
		opts = Object.assign({
			name: name,
			tpl: env.importTpl
		}, opts);
		//use path template?
		if(opts.tpl && name) {
			path = opts.tpl.replace('{name}', path);
		}
		//valid server file prefix?
		if(env.isNode && !(/^(file|data)/.test(path))) {
			path = "file://" + path;
		}
		//cache vars
		importr.path = path;
		importr.cache = importr.cache || {};
		//import cached?
		if(importr.cache[path]) {
			var prom = Promise.resolve(null);
		} else {
			var prom = import(path);
		}
		//wait for promise
		return prom.then(function(exports) {
			//process exports?
			if(exports) {
				//cache exports?
				if(opts.name) {
					//has default?
					if(exports.default) {
						var n = opts.name.replace(/\/./g, function(m) { m[1].toUpperCase() });
						exportr(n, exports.default, false);
					}
					//add named exports?
					if(!exports.default || path.indexOf('/index.') > 0) {
						//loop through exports
						for(var k in exports) {
							if(k !== 'default') {
								exportr(k, exports[k], false);
							}
						}
					}
				}
				//cache module
				importr.cache[path] = exports;
				//dispatch event?
				if(globalThis.dispatchEvent) {
					//create event
					var e = new CustomEvent('importr', {
						detail: {
							path: path,
							exports: exports
						}
					});
					//dispatch
					globalThis.dispatchEvent(e);
				}
			}
			//return
			return importr.cache[path];
		});
	};

	//export handler
	var exportr = function(name, exported, event = true) {
		//create cache
		exportr.cache = exportr.cache || {};
		//cache export
		CONTAINER[name] = exportr.cache[name] = exported;
		//dispatch event?
		if(event && globalThis.dispatchEvent) {
			//create event
			var e = new CustomEvent('exportr', {
				detail: {
					name : name,
					exported: exported
				}
			});
			//dispatch
			globalThis.dispatchEvent(e);
		}
		//return
		return exported;
	};

	//ready handler
	var ready = function(modules, fn) {
		//loaded array
		ready.loaded = ready.loaded || [];
		//is callback?
		if(typeof modules === 'function') {
			fn = modules;
			modules = [];
		}
		//is string?
		if(typeof modules === 'string') {
			modules = modules.replace(' ', '').split(',');
		}
		//use defaults?
		if(!modules.length) {
			modules = DEFAULTS;
		}
		//async call
		setTimeout(function() {
			//load all modules?
			if(modules.length && modules[0] === '@all') {
				modules = MODULES;
			}
			//filter out loaded
			modules = modules.filter(function(m) {
				return !ready.loaded.includes(m);
			});
			//mark as loaded?
			if(modules.length) {
				ready.loaded.push(...modules);
			}
			//import modules
			importr(modules).then(function() {
				fn && fn(exportr.cache);
			});
		}, 0);
	};

	//create import map?
	if(globalThis.document) {
		//set vars
		var mapArr = [];
		var mapPrefix = NAME.toLowerCase();
		//loop through modules
		MODULES.forEach(function(m) {
			//can add to map?
			if(/^[a-zA-Z0-9\/\@]+$/.test(m)) {
				//set vars
				var name = mapPrefix;
				var path = m.replace('@all', 'index');
				var parts = path.split('/');
				//add to name?
				if(name !== parts[0]) {
					name += '/' + parts[0];
				}
				//add to path?
				if(path.indexOf('/') === -1) {
					path += '/' + path;
				}
				//add to array
				mapArr.push('"' + name + '": "' + env.importTpl.replace('{name}', path) + '"');
			}
		});
		//create script
		var s = document.createElement('script');
		var t = document.querySelectorAll('script');
		s.type = 'importmap';
		s.textContent = '{ "imports": { ' + mapArr.join(", ") + ' } }';
		t[0].parentNode.insertBefore(s, t[0]);
	}


	/* EXPORTS */

	//container
	var CONTAINER = {
		version: VERSION,
		env: env,
		importr: importr,
		exportr: exportr,
		ready: ready
	};

	/*
	CONTAINER = new Proxy(CONTAINER, {
		get: function(obj, key) {
			//has key?
			if(obj[key]) {
				return obj[key];
			}
			//import
			return importr(key).then(function() {
				return obj[key];
			});
		}
	});
	*/

	//cjs export?
	if(typeof module === 'object' && module.exports) {
		module.exports = CONTAINER;
	}

	//amd export?
	if(typeof define === 'function' && define.amd) {
		define(NAME, [], function() { return CONTAINER; });
	}

	//globals export
	GLOBALS.forEach(function(g) {
		if(!globalThis[g] || g === NAME) {
			globalThis[g] = CONTAINER;
		}
	});

	//additional globals
	globalThis.importr = globalThis.importr || importr;
	globalThis.exportr = globalThis.exportr || exportr;

})();