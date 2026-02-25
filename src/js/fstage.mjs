/**
 * A javascript module loader and registry, to support building composable frameworks
**/

//config vars
var _name = 'fstage';
var _confName = 'FSCONFIG';
var _modules = [ 'animator', 'component', 'dom', 'env', 'form', 'gestures', 'history', 'hls', 'http', 'interactions', 'ipfs', 'observe', 'pubsub', 'registry', 'router', 'store', 'sync', 'transitions', 'utils', 'webpush', 'websocket' ];

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
	try {
		return fn ? fn.apply(ctx || null, args || []) : null;
	} catch (err) {
		console.error(err);
		throw err;
	}
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

//get path helper
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

//load path helper
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
		//set name
		var name = e.path;
		//format name?
		if(name.indexOf(scope + '/') === 0) {
			name = name.replace(scope + '/', '').replace(/\/index.mjs$/, '');
		}
		//is cached?
		if(_exports[name]) {
			resolve(_exports[name]);
			return;
		}
		//set default scope?
		if(_modules.includes(e.path)) {
			e.path = scope + '/' + e.path;
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
				console.error(err);
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
load(_config.configPath).then(function() {
	//merge config
	globalThis[_confName] = _config = _merge(_config, globalThis[_confName] || {});
	//import map
	_buildMap(_config.importMap);
	//find all import maps
	_config.importMap = _queryMap();
	//set base
	load(_config.baseDir, 'base');
	//load assets
	load(_config.loadAssets).then(function() {
		//notify ready
		globalThis.dispatchEvent(new CustomEvent(_name + '.ready'));
	}).catch(function(err) {
		//notify failed
		globalThis.dispatchEvent(new Event(_name + '.failed'));
	});
}).catch(function(err) {
	//notify failed
	globalThis.dispatchEvent(new Event(_name + '.failed'));
});


/* EXPORTS */

//public API
_global = { get: get, load: load };

//set globals
globalThis[_name] = _global;
globalThis[_confName] = {};

//module export
export { get, load };