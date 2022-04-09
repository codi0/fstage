(function() {

	/* CONFIG */

	var NAME = 'Fstage';
	var VERSION = '0.3.3';
	var GLOBALS = [ NAME, '$' ];
	var MODULES = [ 'core', 'utils', 'pubsub', 'dom', 'dom/effects', 'dom/widgets', 'dom/diff', 'router', 'observe', 'store', 'lit', 'components', 'form', 'transport', 'webpush', 'app' ];


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
	if(typeof __filename !== 'undefined') {
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

	//config params
	var config = (globalThis[NAME] || {}).config || {};

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
			host: config.host || (globalThis.location ? location.protocol + "//" + location.hostname : ''),
			basePath: config.basePath || (globalThis.location ? location.href : ''),
			scriptPath: config.scriptPath || '',
			//nodejs
			parseReq: function(req) {
				env.host = config.host || ((req.protocol || 'http') + "://" + req.headers.host);
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
		//get modules from script?
		if(env.scriptPath.indexOf('#') > 0) {
			MODULES = env.scriptPath.split('#')[1].split(',');
			env.scriptPath = env.scriptPath.split('#')[0];
		}
		//format script path
		env.scriptPath = env.scriptPath.split('?')[0];
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

	//ready handler
	var ready = function(fn) {
		//wrap callback
		var wrap = function() { fn(exportr.exports); };
		//return
		return env.ready ? wrap() : globalThis.addEventListener(NAME.toLowerCase(), wrap);
	};

	//import handler
	var importr = function(path) {
		//bulk import?
		if(typeof path !== 'string') {
			//set vars
			var proms = [];
			//loop through modules
			path.forEach(function(m) {
				proms.push(importr(m));
			});
			//return
			return Promise.all(proms);
		}
		//set vars
		var name = path;
		var prom = Promise.resolve(null);
		//create cache
		importr.modules = importr.modules || {};
		//format path?
		if(env.importTpl && /^[a-zA-Z0-9\/]+$/.test(path)) {
			path = env.importTpl.replace('{name}', path);
		}
		//valid server file prefix?
		if(env.isNode && !(/^(file|data)/.test(path))) {
			path = "file://" + path;
		}
		//import now?
		if(!importr.modules[name]) {
			prom = import(path);
		}
		//wait for promise
		return prom.then(function(exports) {
			//process exports?
			if(exports) {
				//cache exports
				for(k in exports) {
					//get export name
					var n = (k == 'default') ? name.replace(/\/./g, function(m) { m[1].toUpperCase() }) : k;
					//call exportr
					exportr(n, exports[k], false);
				}
				//cache module
				importr.modules[name] = {
					name: name,
					path: path,
					exports: exports
				};
				//dispatch event?
				if(globalThis.dispatchEvent) {
					//create event
					var e = new CustomEvent('importr', {
						detail: importr.modules[name]
					});
					//dispatch
					globalThis.dispatchEvent(e);
				}
			}
			//return
			return importr.modules[name].exports;
		});
	};

	//export handler
	var exportr = function(name, exported, event = false) {
		//create cache
		exportr.exports = exportr.exports || {};
		//cache export
		CONTAINER[name] = exportr.exports[name] = exported;
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
	};

	//replace modules?
	if(config.modules) {
		MODULES = config.modules;
	}

	//append to modules?
	if(config.appendModules) {
		MODULES.push(...config.appendModules);
	}

	//create import map?
	if(globalThis.document) {
		//set vars
		var map = [];
		var name = NAME.toLowerCase();
		//add core module
		map.push('"' + name + '": "' + env.importTpl.replace('{name}', 'core') + '"');
		//loop through mapping
		MODULES.forEach(function(m) {
			if(/^[a-zA-Z0-9\/]+$/.test(m) && m !== 'core') {
				map.push('"' + name + '/' + m + '": "' + env.importTpl.replace('{name}', m) + '"');
			}
		});
		var s = document.createElement('script');
		var t = document.querySelectorAll('script');
		s.type = 'importmap';
		s.textContent = '{ "imports": { ' + map.join(", ") + ' } }';
		t[0].parentNode.insertBefore(s, t[0]);
	}
	
	//import core modules
	importr(MODULES).then(function() {
		//set ready flag
		env.ready = true;
		//create custom event
		var e = new CustomEvent(NAME.toLowerCase());
		//dispatch event
		globalThis.dispatchEvent(e);
	});


	/* EXPORTS */

	//container
	var CONTAINER = {
		version: VERSION,
		config: config,
		env: env,
		ready: ready,
		importr: importr,
		exportr: exportr,
	};

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
		globalThis[g] = globalThis[g] || CONTAINER;
	});

	//additional globals
	globalThis.importr = globalThis.importr || importr;
	globalThis.exportr = globalThis.exportr || exportr;

})();