(function() {

	/* CONFIG */

	var NAME = 'Fstage';
	var GLOBALS = [ NAME, '$' ];
	var MODULES = [ 'core', 'utils', 'pubsub', 'observe', 'transport', 'form', 'dom', 'app', 'webpush', 'hls', 'ipfs' ];
	var DEFAULTS = [ 'core', 'app' ];
	var PRELOAD = [];


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


	/* FUNCTIONS */

	//env params
	var env = (function() {
		//Helper: format path
		var _formatPath = function(path, preload=false) {
			//check for hash
			var parts = path.split('#');
			//set preload?
			if(parts[1] && preload) {
				if(parts[1] === '@all') {
					PRELOAD = MODULES;
				} else {
					PRELOAD = parts[1].split(',');
				}
			}
			//return
			return parts[0].split('?')[0];
		};
		//Helper: format base path
		var _formatBase = function(path) {
			var parts = path.replace(/\/$/g, '').split('/');
			if(parts[parts.length-1].indexOf('.') !== -1) parts.pop();
			return parts.join('/') + '/';
		};
		//Helper: parse user agent
		var _parseUa = function(ua) {
			//set vars
			var res = { deviceOs: '', isMobile: false };
			var platforms = [ { o: 'android', m: true, r: 'Android' }, { o: 'ios', m: true, r: 'iPad|iPhone|watchOS' }, { o: 'ios', m: false, r: 'Macintosh' }, { o: 'windows', m: true, r: 'Windows Phone' }, { o: 'windows', m: false, r: 'Windows' } ];
			//test platforms
			platforms.some(function(el) {
				//user-agent match?
				if(ua.match(new RegExp(el.r, 'i'))) {
					res.deviceOs = el.o;
					res.isMobile = !!el.m;
					return true;
				}
			});
			//return
			return res;
		};
		//Helper: generate canvas URL
		var _canvasUrl = function() {
			var res = '';
			var canvas = globalThis.document ? document.createElement('canvas') : null;
			var ctx = (canvas && canvas.getContext) ? canvas.getContext('2d') : null;
			if(ctx) {
				ctx.textBaseline = "top";
				ctx.font = "14px 'Arial'";
				ctx.textBaseline = "alphabetic";
				ctx.fillStyle = "#f60";
				ctx.fillRect(125, 1, 62, 20);
				ctx.fillStyle = "#069";
				ctx.fillText('cd', 2, 15);
				ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
				ctx.fillText('cd', 4, 17);
				res = canvas.toDataURL();
			}
			return res;
		};
		//Helper: create hash
		var _cyrb53 = function(str, seed=0) {
			var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
			for(var i = 0, ch; i < str.length; i++) {
				ch = str.charCodeAt(i);
				h1 = Math.imul(h1 ^ ch, 2654435761);
				h2 = Math.imul(h2 ^ ch, 1597334677);
			}
			h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
			h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
			h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
			h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
			return 4294967296 * (2097151 & h2) + (h1 >>> 0);
		};
		//helper: generate device ID
		var _deviceId = function(userAgent) {
			var parts = [];
			if(userAgent) {
				parts.push((userAgent || '').toLowerCase().replace(/[^a-z]/g, ''));
			}
			if(globalThis.navigator) {
				parts.push((navigator.language || '').toLowerCase());
			}
			if(globalThis.screen) {
				parts.push(screen.colorDepth || 0);
				parts.push((screen.height > screen.width) ? screen.height+'x'+screen.width : screen.width+'x'+screen.height);
			}
			parts.push(new Date().getTimezoneOffset() || 0);
			parts.push(_canvasUrl());
			return 'ID.' + _cyrb53(parts.join(','));
		};
		//base env
		var env = {
			//flags
			isBrowser: false,
			isNode: false,
			isMobile: false,
			isWorker: false,
			isHybrid: false,
			isStandalone: globalThis.matchMedia && globalThis.matchMedia('(display-mode: standalone)').matches,
			hybridPlatform: '',
			//device
			deviceId: '',
			deviceOs: '',
			deviceUa: globalThis.navigator ? navigator.userAgent : '',
			//server
			host: globalThis.location ? location.protocol + "//" + location.hostname : '',
			basePath: globalThis.location ? location.href : '',
			scriptPath: '',
			//nodejs
			parseReq: function(req) {
				env.host = (req.protocol || 'http') + "://" + req.headers.host;
				env.deviceUa = req.headers['user-agent'];
				env.deviceId = _deviceId(env.deviceUa);
				var p = _parseUa(env.deviceUa);
				env.deviceOs = p.deviceOs;
				env.isMobile = p.isMobile;
			}
		};
		//check hybrid
		if(globalThis._cordovaNative) {
			env.isHybrid = true;
			env.hybridPlatform = 'cordova';
		} else if(globalThis.Capacitor && Capacitor.ishybridPlatform()) {
			env.isHybrid = true;
			env.hybridPlatform = 'capacitor';
		}
		//check platform
		if(typeof __filename !== 'undefined') {
			env.isNode = true;
			env.basePath = process.cwd().replace(/\\/g, '/');
			env.scriptPath = __filename.replace(/\\/g, '/');
		} else if(typeof WorkerGlobalScope !== 'undefined') {
			env.isWorker = true;
		} else	if(typeof window !== 'undefined') {
			env.isBrowser = true;
			env.basePath = (document.querySelector('base') || {}).href || env.basePath;
			env.scriptPath = document.currentScript ? document.currentScript.src : '';
			if(!env.scriptPath) {
				console.log(NAME.toLowerCase() + '.js should not be loaded as a js module');
			}
		}
		
		//format paths
		env.scriptPath = _formatPath(env.scriptPath, true);
		env.basePath = _formatBase(_formatPath(env.basePath));
		//import template path
		env.importTpl = env.scriptPath.replace('/' + NAME.toLowerCase() + '.', '/{name}.').replace(/.js$/, '.mjs').replace('.min.', '.');
		//calculate device ID
		env.deviceId = _deviceId(env.deviceUa);
		//detect device OS
		var p = _parseUa(env.deviceUa);
		env.deviceOs = p.deviceOs;
		env.isMobile = p.isMobile;
		//return
		return env;
	})();

	//import handler
	var importr = function(path, opts = {}) {
		//format name
		var formatName = function(n) {
			return n.replace(new RegExp('^' + NAME.toLowerCase() + '/'), '').replace(/\/index$/, '');
		};
		//bulk import?
		if(typeof path !== 'string') {
			//set vars
			var res = {};
			var names = [];
			var proms = [];
			//loop through modules
			path.forEach(function(m) {
				names.push(formatName(m));
				proms.push(importr(m, opts));
			});
			//wait for promises
			return Promise.all(proms).then(function(exports) {
				//loop through exports
				exports && exports.forEach(function(e, i) {
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
		if(/^[a-zA-Z0-9\/]+$/.test(path)) {
			//set name
			name = path = formatName(path);
			//add index?
			if(path.indexOf('/') === -1) {
				path += '/index';
			}
		}
		//default opts
		opts = Object.assign({
			name: name,
			import: true,
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
			//asset or module?
			if(!opts.import || /\.css(\#|\?|$)/.test(path)) {
				//load asset
				importr.cache[path] = new Promise(function(resolve) {
					//stop here?
					if(!globalThis.document) {
						return resolve();
					}
					//is script?
					var isScript = /\.m?js(\#|\?|$)/.test(path);
					var isModule = /\.(mjs|esm|es6)/.test(path);
					//create element
					var el = document.createElement(isScript ? 'script' : 'link');
					//set properties
					if(isScript) {
						el.src = path;
						el.async = false;
						if(isModule) el.type = 'module';
					} else {
						el.href = path;
						el.rel = 'stylesheet';
					}
					//load event
					el.addEventListener('load', function() {
						resolve()
					});
					//append to document
					document.documentElement.firstChild.appendChild(el);
				});
			} else {
				//import js
				importr.cache[path] = import(path);
			}
		}
		//wait for promise
		return importr.cache[path].then(function(exports) {
			//process exports?
			if(exports && processExports) {
				//cache exports?
				if(opts.name && exports.default) {
					var defName = opts.name.replace(/\/./g, function(m) { m[1].toUpperCase() });
					CONTAINER[defName] = exports.default;
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

	//create import map
	var importMap = function() {
		//set vars
		var mapArr = [];
		var doc = globalThis.document;
		var mapPrefix = NAME.toLowerCase();
		var mapScript = doc ? document.createElement('script') : null;
		var allScripts = doc ? document.querySelectorAll('script') : null;
		//loop through modules
		MODULES.forEach(function(m) {
			//can add to map?
			if(/^[a-zA-Z0-9\/]+$/.test(m)) {
				//set vars
				var path = m;
				var parts = path.split('/');
				var name = mapPrefix + '/' + parts[0];
				//add to path?
				if(path.indexOf('/') === -1) {
					path += '/index';
				}
				//add to array
				mapArr.push("\t\t\"" + name + "\": \"" + env.importTpl.replace('{name}', path) + "\"");
			}
		});
		//loop through extras
		(globalThis.IMPORTMAP || {}).forEach(function(path, name) {
			mapArr.push("\t\t\"" + name + "\": \"" + path + "\"");
		});
		//add import map?
		if(mapScript) {
			mapScript.type = 'importmap';
			mapScript.textContent = "{\n\t\"imports\": {\n" + mapArr.join(",\n") + "\n\t}\n}";
			allScripts[0].parentNode.insertBefore(mapScript, allScripts[0]);
		}
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


	/* BOOTSTRAP */

	//container
	var CONTAINER = {
		env: env,
		importr: importr,
		ready: ready
	};

	//globals export
	GLOBALS.forEach(function(g) {
		if(g === NAME || !globalThis[g]) {
			globalThis[g] = CONTAINER;
		}
	});

	//cjs export?
	if(typeof module === 'object' && module.exports) {
		module.exports = CONTAINER;
	}

	//amd export?
	if(typeof define === 'function' && define.amd) {
		define(NAME, [], function() { return CONTAINER; });
	}
	
	//import map
	importMap();
	
	//preload
	PRELOAD.forEach(function(module) {
		importr(module);
	});

})();