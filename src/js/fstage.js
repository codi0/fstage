(function() {

	/* CONFIG */

	var VERSION = '0.3.1';
	var GLOBALS = [ 'Fstage', '$' ];
	var MODULES = [ 'core', 'utils', 'pubsub', 'dom', 'dom/effects', 'dom/widgets', 'dom/diff', 'router', 'observe', 'store', 'lit', 'components', 'form', 'transport', 'webpush', 'app' ];
	var MINIFIED = false;

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
			value: function(fn, thisArg) {
				for(var k in (this || {})) {
					if(this.hasOwnProperty(k)) {
						fn.call(thisArg || globalThis, this[k], k, this);
					}
				}
			}
		});
	}


	/* API */

	//fstage wrapper
	const Fstage = globalThis.Fstage || {};

	//version number
	Fstage.version = VERSION;

	//config props
	Fstage.config = Fstage.config || {};

	//env props
	Fstage.env = (function() {
		//create env
		var env = {
			os: '',
			deviceId: '',
			isBrowser: false,
			isServer: false,
			isMobile: false,
			isWorker: false,
			isHybrid: !!globalThis._cordovaNative,
			isPwa: globalThis.matchMedia && globalThis.matchMedia('(display-mode: standalone)').matches,
			host: Fstage.config.host || (globalThis.location ? location.protocol + "//" + location.hostname : ''),
			basePath: Fstage.config.basePath || (globalThis.location ? location.pathname : ''),
			scriptPath: Fstage.config.scriptPath || '',
		};
		//is browser?
		if(globalThis.document) {
			env.isBrowser = true;
			env.scriptPath = document.currentScript.src;
			env.basePath = (document.querySelector('base') || {}).href || env.basePath;
		}
		//is node?
		if(globalThis.__filename) {
			env.isServer = true;
			env.scriptPath = __filename;		
		}
		//is worker?
		if(globalThis.WorkerGlobalScope) {
			env.isWorker = true;
		}
		//standardise base path
		env.basePath = env.basePath.replace(/\/$/g, '') + '/';
		//calc device ID
		env.deviceId = (function() {
			var str = navigator.userAgent.replace(/[0-9\.\s]/g, '');
			var h = 5381, i = str.length;
			while(i) h = (h * 33) ^ str.charCodeAt(--i);
			return (h >>> 0).toString();
		})();
		//detect os
		[
			{ o: 'android', m: true, r: 'Android' },
			{ o: 'ios', m: true, r: 'iPad|iPhone|watchOS' },
			{ o: 'ios', m: false, r: 'Macintosh' },
			{ o: 'windows', m: true, r: 'Windows Phone' },
			{ o: 'windows', m: false, r: 'Windows' }
		].some(function(el) {
			//user-agent match?
			if(navigator.userAgent.match(new RegExp(el.r, 'i'))) {
				env.os = el.o;
				env.isMobile = !!el.m;
				return true;
			}
		});
		//return
		return env;
	})();

	//ready handler
	Fstage.ready = function(fn) {
		return Fstage.ready ? fn() : globalThis.addEventListener('fstage.ready', fn);
	};

	//import handler
	Fstage.import = function(path, tpl = null) {
		//set vars
		var name = path;
		var that = Fstage.import;
		//create cache?
		if(!that.exports) {
			that.exports = {};
		}
		//format path?
		if(tpl && /^[a-zA-Z0-9\/]+$/.test(path)) {
			path = tpl.replace('{name}', path);
		}
		//is cached?
		if(!that.exports[path]) {
			//import module
			that.exports[path] = import(path);
			//dispatch module.load event
			globalThis.dispatchEvent(new CustomEvent('module.load', {
				detail: {
					name: name,
					path: path,
					exports: that.exports[path]
				}
			}));
		}
		//return
		return that.exports[path].then(function(exports) {
			return {
				name: name,
				path: path,
				exports: exports
			}
		});
	};

	//import multiple modules
	Fstage.import.all = function(modules, tpl = null) {
		//set vars
		var proms = [];
		//loop through modules
		modules.forEach(function(m) {
			proms.push(Fstage.import(m, tpl));
		});
		//return
		return Promise.all(proms);
	};

	//create import map
	Fstage.import.map = function(mapping, opts = {}) {
		//set vars
		var mapArr = [];
		//loop through mapping
		mapping.forEach(function(path, prefix) {
			mapArr.push('"' + prefix + '": "' + path + '"');
		});
		//create script?
		if(Fstage.env.isBrowser) {
			var s = document.createElement('script');
			var t = document.querySelectorAll('script');
			s.type = 'importmap';
			s.textContent = '{ "imports": { ' + mapArr.join(", ") + ' } }';
			t[0].parentNode.insertBefore(s, t[0]);
		}
	};


	/* EXPORTS */

	//cjs export?
	if(typeof module === 'object' && module.exports) {
		module.exports = Fstage;
	}

	//amd export?
	if(typeof define === 'function' && define.amd) {
		define('Fstage', [], function() { return Fstage; });
	}

	//globals export
	GLOBALS.forEach(function(g) {
		globalThis[g] = globalThis[g] || Fstage;
	});


	/* BOOTSTRAP */
	
	//can load modules?
	if(Fstage.env.scriptPath) {

		//private vars
		var moduleTpl = Fstage.env.scriptPath.replace('/fstage.', '/{name}.').replace(/\.js$/, '.mjs');

		//replace core modules?
		if(Fstage.config.modules && Fstage.config.modules.length) {
			MODULES = Fstage.config.modules;
		}

		//append to core modules?
		if(Fstage.config.appendModules && Fstage.config.appendModules.length) {
			MODULES.push(...Fstage.config.appendModules);
		}

		//create import map
		Fstage.import.map((function() {
			//set vars
			var importMap = {};
			//map core module
			importMap["fstage"] = moduleTpl.replace('{name}', 'core');
			//map additional modules
			MODULES.forEach(function(m) {
				if(/^[a-zA-Z0-9\/]+$/.test(m) && m !== 'core') {
					importMap["fstage/" + m] = moduleTpl.replace('{name}', m);
				}
			});
			//return
			return importMap;
		})());
	
		//import modules
		Fstage.import.all(MODULES, moduleTpl).then(function(results) {
			//loop through results
			results.forEach(function(module) {
				//loop through exports
				for(var k in module.exports) {
					//is default?
					if(k === 'default') {
						Fstage[module.name.replace(/\/./g, function(m) { m[1].toUpperCase() })] = module.exports[k];
					} else {
						Fstage[k] = module.exports[k];
					}
				}
			});
			//set ready flag
			Object.defineProperty(Fstage, 'ready', {
				value: true,
				writable: false
			});
			//dispatch event
			globalThis.dispatchEvent(new CustomEvent('fstage.ready'));
		});

	}

})();