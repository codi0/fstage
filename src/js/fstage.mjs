/**
 * @fstage/fstage
 *
 * Zero-build module loader and registry — the entry point for fstage.
 *
 * Bootstraps the fstage module system:
 *   1. Reads optional config from `window.FSCONFIG`.
 *   2. Injects an import-map for all built-in fstage modules (`@fstage/<name>`).
 *   3. Loads `config.configPath` (if set) and merges it into the active config.
 *   4. Loads `config.loadAssets` and fires `fstage.ready` when complete.
 *
 * Public API (also available on `globalThis.fstage`):
 *   - `get(path, args?)` — retrieve or invoke an export from the module registry.
 *   - `load(path, type?)` — dynamically load modules or assets.
 *
 * Config (`window.FSCONFIG` or a loaded config module's default export):
 *   - `configPath`   — path to a config module (default: `''`, skipped if empty).
 *   - `scriptDir`    — base directory for fstage module resolution.
 *   - `baseDir`      — base directory for relative asset paths.
 *   - `importMap`    — additional import-map entries merged into the auto-generated map.
 *   - `loadAssets`   — assets/modules to load during boot (same format as `load()`).
 *   - `beforeLoad(e)` — hook called before each asset load; mutate `e.path` to redirect.
 *   - `afterLoad(e)`  — hook called after each successful module load.
 *   - `afterLoad<Group>(e)` — called after each named boot-phase group finishes.
 *
 * Events dispatched on `globalThis`:
 *   - `fstage.ready`  — all boot assets loaded successfully.
 *   - `fstage.failed` — an error occurred during boot (detail includes `error`).
 */

//config vars
var _name = 'fstage';
var _confName = 'FSCONFIG';
var _modules = [ 'animator', 'component', 'devtools', 'env', 'form', 'gestures', 'history', 'hls', 'http', 'interactions', 'ipfs', 'observe', 'registry', 'router', 'storage', 'store', 'sync', 'transitions', 'utils', 'webpush', 'websocket' ];

//misc vars
var _global = {};
var _config = {};
var _exports = {};
var _uri = import.meta.url;
var _swUpdate = localStorage.getItem('swUpdate') == 1;

//detect nonce
var _nonce = (function() {
	var el = document.querySelector('script[nonce], style[nonce]');
	return el ? el.getAttribute('nonce') : '';
})();

//invoke callback helper
var _cb = function(fn, args, ctx) {
	return fn ? fn.apply(ctx || null, args || []) : null;
};

//invoke custom event
var _event = function(action, detail = {}) {
	if (detail.error) console.error(detail.error);
	globalThis.dispatchEvent(new CustomEvent(_name + '.' + action, { detail }));
};

//format path helper
var _formatPath = function(path, removeFile=false) {
	//remove hash
	path = path.split('#')[0];
	//remove query
	path = path.split('?')[0];
	//split into segments
	var segs = path.split('/');
	//remove file name?
	if(removeFile && segs.length) {
		if(segs[segs.length-1].indexOf('.') >= 0) {
			segs.pop();
		}
	}
	//update path
	path = segs.join('/');
	//add trailing slash?
	if(segs.length && segs[segs.length-1].indexOf('.') == -1) {
		path = path.replace(/\/$/, '') + '/';
	}
	//return
	return path;
};

//deep merge helper
var _merge = function(target, source) {
	//loop through source
  for(var key in source) {
    if(source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = _merge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
	//return
  return target;
};

//build import map helper
var _buildMap = function(paths) {
	//use map?
	if(!paths || !Object.keys(paths).length) {
		return;
	}
	//create map
	var map = document.createElement('script');
	map.type = 'importmap';
	//set content
	map.textContent = JSON.stringify({
		imports: paths
	});
	//set nonce?
	if(_nonce) {
		map.setAttribute('nonce', _nonce);
	}
	//add to document
	document.documentElement.firstChild.appendChild(map);
};

//query import map helper
var _queryMap = function() {
	//set vars
	var res = {};
	var importMaps = document.querySelectorAll('[type="importmap"]');
	//loop through maps
	importMaps.forEach(function(s) {
		var m = JSON.parse(s.textContent);
		Object.assign(res, m.imports || {});
	});
	//return
	return res;
};

/**
 * Retrieve a value from the fstage export registry by dot-path, optionally
 * invoking it as a function.
 *
 * @param {string} path - Dot-separated path into the registry, e.g. `'store.createStore'`.
 * @param {Array|null} [args=null] - When an Array, the resolved value is called
 *   as a function with these arguments and its return value is returned instead.
 *   The `this` context is set to the nearest constructor ancestor in the path
 *   (detected via `prototype.constructor === value`), so class factory methods
 *   receive the correct `this` automatically.
 * @returns {*} The resolved value, or the result of invoking it when `args` is
 *   an Array, or `null` if any segment of the path is not found.
 *
 * @example
 * // Retrieve a value
 * const store = fstage.get('store');
 *
 * @example
 * // Invoke a factory with arguments
 * const s = fstage.get('store.createStore', [{ state: {} }]);
 */
var get = function(path, args=null) {
  //set vars
  var t = null;
  var res = _exports;
  var arr = path ? path.split('.') : [];
	//loop through array
  for(var i = 0; i < arr.length; i++) {
		//stop here?
    if(!res || !Object.prototype.hasOwnProperty.call(res, arr[i])) {
			return null;
		}
    //update result
    res = res[arr[i]];
    //set this?
    if(i < (arr.length-1)) {
			if(res && res.prototype && res.prototype.constructor === res) {
				t = res;
			}
    }
  }
	//has args?
	if(Array.isArray(args)) {
		res = _cb(res, args, t);
	}
	//return
	return res;
};

/**
 * Load one or more assets and/or fstage modules, returning a Promise that
 * resolves when all requested assets are ready.
 *
 * Accepted `path` shapes:
 *   - **string** — a single asset.  Special values:
 *       - `'@all'`  loads every built-in fstage module.
 *       - A bare module name (`'store'`, `'router'`, …) resolves via the
 *         import-map to `@fstage/<name>/index.mjs`.
 *       - Any string ending in `.mjs`, `.js`, `+esm`, or matching a bare
 *         package-scope pattern is treated as an ES module (`import()`).
 *       - Strings ending in `.css` (or similar) are injected as `<link>` tags.
 *       - `'manifest.<ext>'` / `'favicon.<ext>'` update existing `<link>` tags.
 *   - **Array** — shorthand for an object with numeric keys; all items load
 *     in parallel.
 *   - **Object (flat)** — all values load in parallel.
 *   - **Object (nested)** — each top-level key whose value is itself an object
 *     forms a *group*: the group loads first, then `config.afterLoad<Group>`
 *     is called, then the remaining keys load. Useful for ordered boot phases.
 *
 * Config hooks (set via `FSCONFIG` or the loaded config module):
 *   - `beforeLoad(e)` — called before each asset; mutate `e.path` to redirect.
 *   - `afterLoad(e)`  — called after each successful module load.
 *   - `afterLoad<Group>(e)` — called after a named group finishes.
 *
 * @param {string|string[]|Object} path - Asset(s) to load (see above).
 * @param {string} [type=''] - Override the auto-detected element type
 *   (`'module'`, `'stylesheet'`, `'icon'`, `'manifest'`, `'base'`, …).
 * @returns {Promise<*>} Resolves with the module exports (for ES modules),
 *   an array of exports (for parallel loads), or `undefined` for non-module
 *   assets.
 *
 * @example
 * // Load a single built-in module
 * await fstage.load('store');
 *
 * @example
 * // Load several modules in parallel
 * await fstage.load(['store', 'router', 'component']);
 *
 * @example
 * // Two-phase boot: load core first, then features
 * await fstage.load({
 *   core: { store: 'store', router: 'router' },
 *   features: ['form', 'http']
 * });
 */
var load = function(path, type='') {
	//set vars
	var scope = '@' + _name;
	//Helper: is object
	var isObject = function(input) {
		return input && input.constructor === Object;
	};
	//Helper: format input
	var formatInput = function(input) {
		//is array or object?
		if(Array.isArray(input)) {
			var obj = input.length ? {} : null;
			for(var i=0; i < input.length; i++) obj[i] = formatInput(input[i]);
			return obj;
		} else if(isObject(input)) {
			for(var i in input) {
				input[i] = formatInput(input[i]);
			}
		}
		//return
		return input;
	};
	//load all modules?
	if(path === '@all') {
		path = _modules;
	}
	//format input
	path = formatInput(path);
	//stop here?
	if(!path) {
		return Promise.resolve();
	}
	//is object?
	if(isObject(path)) {
		//set vars
		var proms = [];
		//loop through props
		for(var i in path) {
			//is nested?
			if(isObject(path[i])) {
				//load first group
				return load(path[i]).then(function(res) {
					//get group name
					var group = i[0].toUpperCase() + i.slice(1);
					//create event
					var e = { modules: res, get: get };
					//group loaded hook
					_cb(_config['afterLoad' + group], [ e ]);
					//delete property
					delete path[i];
					//load next
					return load(path);
				});
			}
			//add to array
			proms.push(load(path[i]));
		}
		//wait for load
		return Promise.all(proms);
	}
	//create promise
	return new Promise(function(resolve, reject) {
		//create event
		var e = {
			get: get,
			type: type,
			path: path
		};
		//set default scope?
		if(_modules.includes(e.path)) {
			e.path = scope + '/' + e.path;
		}
		//set name
		var name = e.path;
		//format name?
		if(name.indexOf(scope + '/') === 0) {
			name = name.replace(scope + '/', '').replace(/\/index\.mjs$/, '');
		}
		//remove extension?
		if(name.indexOf('://') === -1) {
			name = name.replace('@', '').replace(/\.m?js$/, '');
		}
		//is cached?
		if(_exports[name]) {
			resolve(_exports[name]);
			return;
		}
		//before load hook
		_cb(_config['beforeLoad'], [ e ]);
		//valid path?
		if(!e.path) {
			return resolve();
		}
		//set vars
		var isBase = (e.type === 'base');
		var isScript = /(\+esm|\.m?js)(\#|\?|$)/.test(e.path);
		//guess type?
		if(!e.type) {
			if(/^[a-zA-Z0-9\/\-\_\@]+$/.test(e.path) || /(\.|\?|\+)(mjs|esm|es6)/.test(e.path)) {
				e.type = 'module';
			} else if(/(manifest)\./.test(e.path)) {
				e.type = 'manifest';
			} else if(/(favico)n?\./.test(e.path)) {
				e.type = 'icon';
			}
		}
		//resolve import map?
		if(_config.importMap[e.path]) {
			e.path = _config.importMap[e.path];
		} else {
			var bestMatch = Object.keys(_config.importMap).filter(function(key) {
				return e.path.indexOf(key) === 0 && key[key.length-1] === '/';
			}).sort(function(a, b) {
				return b.length - a.length;
			})[0];
			if (bestMatch) {
				e.path = _config.importMap[bestMatch] + e.path.slice(bestMatch.length);
			}
		}
		//add base path?
		if(e.path.indexOf(_config.baseDir) == -1 && e.path.indexOf('://') == -1 && e.path.indexOf('.') >= 0) {
			e.path = _config.baseDir + e.path;
		}
		//is module?
		if(e.type === 'module') {
			//dynamic import
			return import(e.path).then(function(exports) {
				//cache exports
				e.exports = _exports[name] = exports || {};
				//after load hook
				_cb(_config['afterLoad'], [ e ]);
				//resolve
				resolve(e.exports);
			}).catch(function(err) {
				reject(err);
			});
		}
		//update existing link?
		if(e.type === 'icon' || e.type === 'manifest') {
			var i = document.querySelector('link[rel="' + e.type + '"]');
			if(i) { i.href = e.path; return resolve(); }
		}
		//create element
		var el = document.createElement(isBase ? 'base' : (isScript ? 'script' : 'link'));
		//set properties
		if(isScript) {
			el.src = e.path;
			el.async = false;
			if(e.type) el.type = e.type;
			
		} else {
			el.href = e.path;
			if(!isBase) {
				el.rel = e.type || 'stylesheet';
			}
		}
		//use listeners?
		if(isScript || el.rel === 'stylesheet') {
			el.setAttribute('crossorigin', 'anonymous');
			el.addEventListener('load', resolve);
			el.addEventListener('error', reject);
		} else {
			resolve();
		}
		//append to document
		document.documentElement.firstChild.appendChild(el);
	});
};


/* INIT */

//setup config object
_config = _exports['config'] = Object.assign({
	configPath: '',
	scriptDir: _formatPath(import.meta.url, true),
	baseDir: _formatPath((document.querySelector('base') || {}).href || location.href, true),
	importMap: {}
}, globalThis[_confName] || {});

//add core mappings
_config.importMap['@' + _name ] = _uri;
_config.importMap['@' + _name + '/'] = _config.scriptDir;

//loop through defined modules
for(var i=0; i < _modules.length; i++) {
	_config.importMap['@' + _name + '/' + _modules[i]] = _config.scriptDir + _modules[i] + '/index.mjs';
}

//load config
load(_config.configPath).then(function(m) {
	//merge config
	_config = _merge(_config, (m && m.default) || {});
	//import map
	_buildMap(_config.importMap);
	//find all import maps
	_config.importMap = _queryMap();
	//set base
	load(_config.baseDir, 'base');
	//load assets
	load(_config.loadAssets).then(function() {
		_event('ready');
	}).catch(function(error) {
		_event('failed', { error });
	});
}).catch(function(error) {
	_event('failed', { error });
});


/* EXPORTS */

//public API
_global = { get: get, load: load };

//set globals
globalThis[_name] = _global;

//module export
export { get, load };