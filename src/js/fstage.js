(function() {

	/* CONFIG */

	var NAME = 'Fstage';
	var VERSION = '0.3.8';
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
			var res = {};
			var names = [];
			var proms = [];
			//loop through modules
			path.forEach(function(m) {
				names.push(m.replace(/(\/\@all|\/index)$/g, ''));
				proms.push(importr(m, opts));
			});
			//wait for promises
			return Promise.all(proms).then(function(exports) {
				//loop through exports
				exports.forEach(function(e, i) {
					res[names[i]] = e;
				});
				//return
				return res;
			});
		}
		//set vars
		var name = '';
		var parts = path.split('/');
		var processExports = false;
		//create cache
		importr.cache = importr.cache || {};
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
		//import now?
		if(!importr.cache[path]) {
			//mark for processing
			importr.path = path;
			processExports = true;
			//dynamic import
			importr.cache[path] = import(path);
		}
		//wait for promise
		return importr.cache[path].then(function(exports) {
			//process exports?
			if(processExports) {
				//cache exports?
				if(opts.name) {
					//has default?
					if(exports.default) {
						var defName = opts.name.replace(/\/./g, function(m) { m[1].toUpperCase() });
						CONTAINER[defName] = exports.default;
					}
					//add named exports?
					if(!exports.default || path.indexOf('/index.') > 0) {
						//loop through exports
						for(var k in exports) {
							if(k !== 'default') {
								CONTAINER[k] = exports[k];
							}
						}
					}
				}
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
			return exports;
		});
	};

	//ready handler
	var ready = function(modules, fn) {
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
		//load all modules?
		if(modules[0] === '@all') {
			modules = MODULES;
		}
		//async call
		setTimeout(function() {
			//import modules
			importr(modules).then(function(exports) {
				fn && fn(exports);
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
		ready: ready
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
		if(g === NAME || !globalThis[g]) {
			globalThis[g] = CONTAINER;
		}
	});

	//additional globals
	globalThis.importr = importr;

})();