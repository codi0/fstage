/**
 * @fstage
 *
 * Zero-build module loader and registry. Creates the root config, injects the
 * import map, loads configured assets, and exposes `modules` / `configs` on
 * `globalThis.fstage`.
 */

var _exports = {};
var _configs = {};
var _rootConfig = {};

var _name = 'fstage';
var _confName = 'FSCONFIG';
var _uri = import.meta.url;

var _coreModules = [
	'animator', 'component', 'devtools', 'env', 'form', 'gestures', 'history', 'http',
	'interactions', 'native', 'plugin', 'push', 'registry', 'router', 'ssr', 'stack',
	'storage', 'store', 'sync', 'transitions', 'ui', 'utils', 'websocket'
];

/**
 * Content-Security-Policy nonce copied onto injected tags when present.
 *
 * @type {string}
 */
var _nonce = (function() {
	var el = document.querySelector('script[nonce], style[nonce]');
	return el ? el.getAttribute('nonce') : '';
})();

/**
 * Invoke a callback if present.
 *
 * @param {Function|null|undefined} fn Callback to invoke.
 * @param {Array<*>} [args=[]] Arguments passed to the callback.
 * @param {*} [ctx=null] Optional `this` context.
 * @returns {*} The callback result, or `null` when `fn` is falsy.
 */
var _call = function(fn, args, ctx) {
	return fn ? fn.apply(ctx || null, args || []) : null;
};

/**
 * Invoke a callback and normalize the result to a promise.
 *
 * @param {Function|null|undefined} fn Callback to invoke.
 * @param {Array<*>} [args=[]] Arguments passed to the callback.
 * @param {*} [ctx=null] Optional `this` context.
 * @returns {Promise<*>} Promise resolved with the callback result.
 */
var _callAsync = function(fn, args, ctx) {
	try {
		return Promise.resolve(_call(fn, args, ctx));
	} catch(error) {
		return Promise.reject(error);
	}
};

/**
 * Dispatch a namespaced DOM custom event.
 *
 * Errors included in the detail are logged to the console before dispatch.
 *
 * @param {string} action Event action suffix.
 * @param {Object} [detail={}] Event detail payload.
 * @returns {void}
 */
var _event = function(action, detail) {
	detail = detail || {};
	if(detail.error) console.error(detail.error);
	globalThis.dispatchEvent(new CustomEvent(_name + '.' + action, { detail: detail }));
};

/**
 * Normalize a URL or path and optionally strip the trailing file segment.
 *
 * @param {string} path Input path.
 * @param {boolean} [removeFile=false] Remove the last path segment when it looks like a file.
 * @returns {string} Normalized path.
 */
var _formatPath = function(path, removeFile) {
	removeFile = !!removeFile;
	path = String(path || '');
	path = path.split('#')[0];
	path = path.split('?')[0];
	var segs = path.split('/');
	if(removeFile && segs.length) {
		if(segs[segs.length - 1].indexOf('.') >= 0) {
			segs.pop();
		}
	}
	path = segs.join('/');
	if(segs.length && segs[segs.length - 1].indexOf('.') === -1) {
		path = path.replace(/\/$/, '') + '/';
	}
	return path;
};

/**
 * Deep-merge source values into a target object.
 *
 * Objects are merged recursively. Arrays and primitives replace the current value.
 *
 * @param {Object} target Target object.
 * @param {Object} source Source object.
 * @returns {Object} The mutated target object.
 */
var _merge = function(target, source) {
	for(var key in source) {
		if(source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
			target[key] = _merge(target[key] || {}, source[key]);
		} else {
			target[key] = source[key];
		}
	}
	return target;
};

/**
 * Determine whether a value is a plain object.
 *
 * @param {*} input Value to test.
 * @returns {boolean} `true` when the value is a plain object.
 */
var _isObject = function(input) {
	return !!input && input.constructor === Object;
};

/**
 * Dispatch a hook across all registered configs.
 *
 * Hooks are awaited in registration order. Missing hooks are skipped.
 *
 * @param {string} name Hook name.
 * @param {*} e Event payload passed to each hook.
 * @returns {Promise<void>} Promise resolved when all hook handlers complete.
 */
var _runHook = async function(name, e) {
	for (var i in _configs) {
		var cfg = _configs[i];
		e.config = cfg;
		await _callAsync(cfg && cfg[name], [ e ]);
	}
	delete e.config;
};

/**
 * Dispatch `onLoadError` across all registered configs until one aborts.
 *
 * Returning `false` from any handler aborts recovery and causes the original
 * load error to be re-thrown.
 *
 * @param {FstageLoadErrorEvent} e Error event payload.
 * @returns {Promise<boolean>} `true` when the error was recoverable, otherwise `false`.
 */
var _runErrorHook = async function(e) {
	for (var i in _configs) {
		var cfg = _configs[i];
		e.config = cfg;
		var fn = cfg && cfg.onLoadError;
		if(fn) {
			var result = await _callAsync(fn, [ e ]);
			if(result === false) {
				delete e.config;
				return false;
			}
		}
	}
	delete e.config;
	return true;
};

/**
 * Normalize `modules.load()` input so arrays become plain objects recursively.
 *
 * This preserves the loader's parallel-loading behavior while simplifying
 * internal traversal.
 *
 * @param {*} input Original load input.
 * @returns {*} Normalized input.
 */
var _formatInput = function(input) {
	if(Array.isArray(input)) {
		var obj = input.length ? {} : null;
		for(var i = 0; i < input.length; i++) {
			obj[i] = _formatInput(input[i]);
		}
		return obj;
	}
	if(_isObject(input)) {
		for(var key in input) {
			input[key] = _formatInput(input[key]);
		}
	}
	return input;
};

/**
 * Resolve a module/asset path against built-in aliases and the active import map.
 *
 * @param {FstageLoadEvent} e Mutable load event.
 * @returns {string} Normalized registry name for the path.
 */
var _resolvePath = function(e) {
	var scope = '@' + _name;
	if(_coreModules.includes(e.path)) {
		e.path = scope + '/' + e.path;
	}
	var name = e.path;
	if(name.indexOf(scope + '/') === 0) {
		name = name.replace(scope + '/', '').replace(/\/index\.mjs$/, '');
	}
	if(name.indexOf('://') === -1) {
		name = name.replace('@', '').replace(/\.m?js$/, '');
	}
	if(_rootConfig.importMap[e.path]) {
		e.path = _rootConfig.importMap[e.path];
	} else {
		var bestMatch = Object.keys(_rootConfig.importMap).filter(function(specifier) {
			return e.path.indexOf(specifier) === 0 && specifier[specifier.length - 1] === '/';
		}).sort(function(a, b) {
			return b.length - a.length;
		})[0];
		if(bestMatch) {
			e.path = _rootConfig.importMap[bestMatch] + e.path.slice(bestMatch.length);
		}
	}
	if(e.path.indexOf(_rootConfig.baseDir) === -1 && e.path.indexOf('://') === -1 && e.path.indexOf('.') >= 0) {
		e.path = _rootConfig.baseDir + e.path;
	}
	return name;
};

/**
 * Infer the load type for a path when no explicit type was supplied.
 *
 * @param {FstageLoadEvent} e Mutable load event.
 * @returns {void}
 */
var _resolveType = function(e) {
	if(e.type) {
		return;
	}
	if(/^[a-zA-Z0-9\/\-\_\@]+$/.test(e.path) || /(\.|\?|\+)(mjs|esm|es6)/.test(e.path)) {
		e.type = 'module';
	} else if(/(manifest)\./.test(e.path)) {
		e.type = 'manifest';
	} else if(/(favico)n?\./.test(e.path)) {
		e.type = 'icon';
	}
};


/**
 * Public module namespace.
 *
 * @type {FstageModulesApi}
 */
var modules = {
	/**
	 * Inject import-map entries into the document.
	 *
	 * @param {FstageImportMapEntries} paths Import-map entries to inject.
	 * @param {HtmlElement} target Node to add import map to
	 * @returns {FstageImportMapEntries} paths Import-map entries injected.
	 */
	map: function(paths, target) {
		if(!paths || !Object.keys(paths).length) {
			return {};
		}
		var el = document.createElement('script');
		el.type = 'importmap';
		el.textContent = JSON.stringify({ imports: paths });
		if(_nonce) {
			el.setAttribute('nonce', _nonce);
		}
		(target || document.documentElement.firstChild).appendChild(el);
		return paths;
	},

	/**
	 * Retrieve a value from the internal registry by dot-path, optionally invoking it.
	 *
	 * @param {string} path Dot-separated path into the registry.
	 * @param {Array<*>|null} [args=null] When provided, invoke the resolved value with these arguments.
	 * @returns {*} The resolved value, the invocation result, or `null` if not found.
	 */
	get: function(path, args) {
		args = (typeof args === 'undefined') ? null : args;
		var t = null;
		var res = _exports;
		var arr = path ? path.split('.') : [];
		for(var i = 0; i < arr.length; i++) {
			if(!res || !Object.prototype.hasOwnProperty.call(res, arr[i])) {
				return null;
			}
			res = res[arr[i]];
			if(i < (arr.length - 1)) {
				if(res && res.prototype && res.prototype.constructor === res) {
					t = res;
				}
			}
		}
		if(Array.isArray(args)) {
			res = _call(res, args, t);
		}
		return res;
	},

	/**
	 * Load one or more assets and/or fstage modules.
	 *
	 * @param {string|Array<*>|Object<string, *>} path Asset(s) or module(s) to load.
	 * @param {string} [type=''] Explicit type override.
	 * @returns {Promise<*>} Promise that resolves when the requested load completes.
	 */
	load: async function(path, type) {
		type = type || '';
		if(path === '@all') {
			path = _coreModules;
		}
		path = _formatInput(path);
		if(!path) {
			return;
		}
		if(_isObject(path)) {
			var groupName = null;
			for(var g in path) {
				if(_isObject(path[g])) {
					groupName = g;
					break;
				}
			}
			if(groupName) {
				var groupPath = path[groupName];
				var result = await modules.load(groupPath);
				await _runHook('afterLoad' + groupName[0].toUpperCase() + groupName.slice(1), {
					result: result,
					modules: modules,
					configs: configs,
				});
				delete path[groupName];
				return await modules.load(path);
			}
			var entries = Object.keys(path).map(function(key) {
				return modules.load(path[key]).catch(async function(err) {
					var errorEvent = { error: err, path: (err && err.path) || '', modules: modules, configs: configs };
					if(await _runErrorHook(errorEvent)) {
						return undefined;
					}
					throw err;
				});
			});
			return await Promise.all(entries);
		}

		var e = {
			modules: modules,
			configs: configs,
			type: type,
			path: path,
		};
		if(!e.path) {
			return;
		}
		var name = _resolvePath(e);
		if(_exports[name]) {
			return _exports[name];
		}
		await _runHook('beforeLoad', e);
		if(!e.path) {
			return;
		}
		var isBase = (e.type === 'base');
		var isScript = /(\+esm|\.m?js)(\#|\?|$)/.test(e.path);
		_resolveType(e);
		if(e.type === 'module') {
			try {
				e.exports = _exports[name] = (await import(e.path)) || {};
				await _runHook('afterLoad', e);
				return e.exports;
			} catch(error) {
				var loadErr = (error instanceof Error) ? error : new Error(String(error));
				if(!loadErr.path) {
					loadErr.path = e.path;
				}
				throw loadErr;
			}
		}
		if(e.type === 'icon' || e.type === 'manifest') {
			var existing = document.querySelector('link[rel="' + e.type + '"]');
			if(existing) {
				existing.href = e.path;
				return;
			}
		}
		return await new Promise(function(resolve, reject) {
			var el = document.createElement(isBase ? 'base' : (isScript ? 'script' : 'link'));
			if(isScript) {
				el.src = e.path;
				el.async = false;
				if(e.type) {
					el.type = e.type;
				}
			} else {
				el.href = e.path;
				if(!isBase) {
					el.rel = e.type || 'stylesheet';
				}
			}
			if(isScript || el.rel === 'stylesheet') {
				el.setAttribute('crossorigin', 'anonymous');
				el.addEventListener('load', resolve);
				el.addEventListener('error', function() {
					var loadErr = new Error('Failed to load: ' + e.path);
					loadErr.path = e.path;
					reject(loadErr);
				});
			} else {
				resolve();
			}
			if(_nonce) {
				el.setAttribute('nonce', _nonce);
			}
			document.documentElement.firstChild.appendChild(el);
		});
	}
};

/**
 * Public config-registry namespace.
 *
 * @type {FstageConfigsApi}
 */
var configs = {
	/**
	 * Return the root config object.
	 *
	 * @returns {FstageConfig} Root config.
	 */
	root: function() {
		return _rootConfig;
	},

	/**
	 * Return all registered configs in registration order.
	 *
	 * The returned object is a shallow copy and can be safely mutated by callers.
	 *
	 * @returns {FstageConfigs} Registered configs.
	 */
	all: function() {
		return Object.assign({}, _configs);
	},

	/**
	 * Register a config object for hook participation.
	 *
	 * @param {string} filePath to config file loaded.
	 * @param {FstageConfig} cfg Config object to register.
	 * @throw {Error} if invalid filePath string or cfg object provided
	 * @returns {FstageConfig|null} The registered config.
	 */
	add: function(filePath, cfg) {
		if(!filePath || !cfg) {
			throw new Error("[fstage] configs.add() requires a valid filePath string and cfg object");
		}
		if(!_configs[filePath]) {
			_configs[filePath] = cfg;
			if(cfg.importMap) {
				modules.map(cfg.importMap);
			}
		}
		return _configs[filePath];
	},

	/**
	 * Remove a config object for hook participation.
	 *
	 * @param {string|FstageConfig} cfg to remove from configs
	 */
	remove: function(cfg) {
		for(var i in _configs) {
			if (cfg === i || cfg === _configs[i]) {
				delete _configs[i];
			}
		}
	}
};


/* BOOTSTRAP */

_rootConfig = Object.assign({
	importMap: {},
	configPath: '',
	scriptDir: _formatPath(import.meta.url, true),
	baseDir: _formatPath((document.querySelector('base') || {}).href || location.href, true),
}, globalThis[_confName] || {});

_exports.modules = modules;
_exports.configs = configs;
_exports.config = _rootConfig;

_rootConfig.importMap['@' + _name] = _uri;
_rootConfig.importMap['@' + _name + '/'] = _rootConfig.scriptDir;

for(var i = 0; i < _coreModules.length; i++) {
	_rootConfig.importMap['@' + _name + '/' + _coreModules[i]] = _rootConfig.scriptDir + _coreModules[i] + '/index.mjs';
}

(async function() {
	try {
		var cfgMod = await modules.load(_rootConfig.configPath);
		if(cfgMod && cfgMod.default) {
			_merge(_rootConfig, cfgMod.default);
		}
		if(_rootConfig.configPath) {
			configs.add(_rootConfig.configPath, _rootConfig);
		} else {
			modules.map(_rootConfig.importMap);
		}
		await modules.load(_rootConfig.baseDir, 'base');
		await modules.load(_rootConfig.loadAssets);
		_event('ready');
	} catch(error) {
		_event('failed', { error: error, path: (error && error.path) || '' });
	}
})();


/* EXPORTS */

globalThis[_name] = {
	modules: modules,
	configs: configs,
};

export { modules, configs };
