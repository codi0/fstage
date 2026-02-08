//Private: vars
var _exports = {};
var _name = 'fstage';
var _swUpdate = localStorage.getItem('swUpdate') == 1;
var _modules = [ 'animator', 'diff', 'dom', 'env', 'form', 'hls', 'http', 'ipfs', 'interaction', 'lit', 'observe', 'pubsub', 'queue', 'registry', 'router', 'store', 'sync', 'utils', 'webpush', 'websocket' ];

//Private: format path
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

//Private: config
var _config = _exports['config'] = Object.assign({
	configPath: '',
	scriptPath: _formatPath(import.meta.url),
	basePath: _formatPath((document.querySelector('base') || {}).href || location.href, true),
	importMap: {}
}, globalThis.FSCONFIG || {});

//Private: safe callback
var _cb = function(fn, args, ctx=null) {
	try {
		return fn ? fn.apply(ctx, args) : null;
	} catch (err) {
		console.error(err);
		throw err;
	}
}

//Public: get helper
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

//Public: load helper
var load = function(path, type='') {
	//set vars
	var name = '';
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
	//format input
	path = formatInput(path);
	//check path
	if(path === '@all') {
		path = _modules;
	} else if(!path) {
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
					//group loaded hook
					_cb(_config['afterLoad' + group], [ res ], fstage);
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
		var e = { path: path, type: type };
		//is module?
		if(_modules.includes(e.path)) {
			e.path = scope + '/' + e.path;
		}
		//before load hook
		_cb(_config['beforeLoad'], [ e ], fstage);
		//valid path?
		if(!e.path) {
			return resolve();
		}
		//set vars
		var isBase = (e.type == 'base');
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
		//is module?
		if(e.type == 'module') {
			//add base path?
			if(e.path.indexOf(_config.basePath) == -1 && e.path.indexOf('://') == -1 && e.path.indexOf('.') >= 0) {
				e.path = _config.basePath + e.path;
			}
			//dynamic import
			return import(e.path).then(function(exports) {
				//add to event
				e.exports = exports;
				e.name = e.path.replace(scope + '/', '');
				//process exports?
				if(e.exports) {
					//is fstage module?
					if(!_exports[e.name] && _modules.includes(e.name)) {
						//set default?
						if(e.exports.default || e.exports[e.name]) {
							_exports[e.name] = e.exports.default || e.exports[e.name];
						} else {
							_exports[e.name] = {};
						}
						//loop through exports
						for(var i in e.exports) {
							if(i !== 'default' && i != e.name) {
								_exports[e.name][i] = e.exports[i];
							}
						}
					}
					//after load hook
					_cb(_config['afterLoad'], [ e ], fstage);
				}
				//resolve
				resolve(e.exports);
			}).catch(function(err) {
				console.error(err);
				reject(err);
			});
		}
		//update existing link?
		if(e.type == 'icon' || e.type == 'manifest') {
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
		if(isScript || el.rel == 'stylesheet') {
			el.setAttribute('crossorigin', 'anonymous');
			[ 'load', 'error' ].forEach(function(k) {
				el.addEventListener(k, function() {	
					if(k == 'load') {
						resolve();
					} else {
						reject();
					}
				});
			});
		} else {
			resolve();
		}
		//append to document
		document.documentElement.firstChild.appendChild(el);
	});
};

//Public: import map
var map = function(paths) {
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
	//add to document
	document.documentElement.firstChild.appendChild(map);
};

//Public: wrapper
var fstage = {
	get: get,
	load: load,
	map: map
};

//global export
globalThis.Fstage = fstage;

//cjs export?
if(typeof module == 'object' && module.exports) {
	module.exports = fstage;
}

//amd export?
if(typeof define == 'function' && define.amd) {
	define(_name, [], function() { return fstage; });
}

//module export
export { get, load, map };

//create modules map
var importModules = {};
importModules['@' + _name + '/core'] = _config.scriptPath;
for(var i=0; i < _modules.length; i++) {
	importModules['@' + _name + '/' + _modules[i]] = _config.scriptPath.replace('/' + _name + '.', '/' + _modules[i] + '/index.').replace('.min.', '.');
}

//import maps
map(importModules);
map(_config.importMap);
_config.importMap = {};

//load config
load(_config.configPath).then(function() {
	//merge config
	_config = Object.assign(_config, globalThis.FSCONFIG || {});
	globalThis.FSCONFIG = _config;
	//import map
	map(_config.importMap);
	//set base
	load(_config.basePath, 'base');
	//load assets
	load(_config.loadAssets).then(function() {
		//notify ready
		globalThis.dispatchEvent(new CustomEvent('fstage.ready'));
	}).catch(function(err) {
		//notify failed
		globalThis.dispatchEvent(new Event('fstage.failed'));
	});
}).catch(function(err) {
	//notify failed
	globalThis.dispatchEvent(new Event('fstage.failed'));
});