//Private: vars
var _imports = {};
var _name = 'fstage';
var _swUpdate = localStorage.getItem('swUpdate') == 1;
var _modules = [ 'diff', 'dom', 'env', 'form', 'hls', 'http', 'ipfs', 'lit', 'observe', 'pubsub', 'queue', 'registry', 'router', 'store', 'sync', 'utils', 'webpush', 'websocket' ];

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

//Private: run filters
var _runFilters = function(type, e) {
	//get filters
	var arr = config[type + 'Filters'] || [];
	//convert to array?
	if(arr && !Array.isArray(arr)) {
		arr = [ arr ];
	}
	//set update flag
	e.swUpdate = _swUpdate;
	//loop through array
	arr.forEach(function(fn) {
		fn(e, fstage);
	});
};

//Public: load asset
var loadAsset = function(path, type='') {
	//set vars
	var name = '';
	var proms = [];
	var scope = '@' + _name;
	//check path
	if(path == '@all') {
		path = _modules;
	} else if(!path) {
		return Promise.resolve();
	}
	//is array?
	if(Array.isArray(path)) {
		//nested array?
		if(Array.isArray(path[0])) {
			//load first array, then wait
			return loadAsset(path.shift()).then(function() {
				return loadAsset(path);
			});
		}
		//add promises
		path.forEach(function(p) {
			proms.push(loadAsset(p));
		});
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
		//run load filters
		_runFilters('load', e);
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
			if(e.path.indexOf(config.basePath) == -1 && e.path.indexOf('://') == -1 && e.path.indexOf('.') >= 0) {
				e.path = config.basePath + e.path;
			}
			//dynamic import
			return import(e.path).then(function(exports) {
				//add to event
				e.exports = exports;
				e.name = e.path.replace(scope + '/', '');
				//process exports?
				if(e.exports) {
					//is fstage module?
					if(!fstage[e.name] && _modules.includes(e.name)) {
						//set default?
						if(e.exports.default || e.exports[e.name]) {
							fstage[e.name] = e.exports.default || e.exports[e.name];
						} else {
							fstage[e.name] = {};
						}
						//loop through exports
						for(var i in e.exports) {
							if(i !== 'default' && i != e.name) {
								fstage[e.name][i] = e.exports[i];
							}
						}
					}
					//run export filters
					_runFilters('export', e);
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
var importMap = function(paths) {
	//set vars
	var scope = '@' + _name;
	var map = document.querySelector('script[type="importmap"]');
	//check paths?
	if(!paths) {
		return;
	}
	//create map?
	if(!map) {
		map = document.createElement('script');
		map.type = 'importmap';
		document.documentElement.firstChild.appendChild(map);
	} else {
		var content = JSON.parse(map.textContent) || {};
		_imports = Object.assign(content.imports || {}, _imports);
	}
	//is modules array?
	if(Array.isArray(paths)) {
		var tmp = {};
		for(var i=0; i < paths.length; i++) {
			tmp[paths[i]] = paths[i];
		}
		paths = tmp;
	}
	//loop through paths
	for(var name in (paths || {})) {
		//skip property?
		if(!paths.hasOwnProperty(name)) {
			continue;
		}
		//get path
		var path = paths[name];
		//is module?
		if(/^[a-zA-Z0-9\/]+$/.test(path)) {
			//add scope to name?
			if(name[0] != '@') {
				name = scope + '/' + name;
			}
			//add to path?
			if(path.indexOf('/') == -1) {
				path += '/index';
			}
			//format path
			path = config.scriptPath.replace('/' + _name + '.', '/' + path + '.').replace('.min.', '.');
		}
		//add to imports?
		if(!_imports[name]) {
			_imports[name] = path;
		}
	}
	//update content
	map.textContent = JSON.stringify({
		imports: _imports
	});
};

//Public: config
var config = Object.assign({
	configPath: '',
	scriptPath: _formatPath(import.meta.url),
	basePath: _formatPath((document.querySelector('base') || {}).href || location.href, true)
}, globalThis.FSCONFIG || {});

//Public: wrapper
var fstage = {
	config: config,
	load: loadAsset,
	importMap: importMap
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
export { fstage, config, loadAsset, importMap };

//set core import
_imports['@' + _name + '/core'] = config.scriptPath;

//create import map
importMap(_modules);

//load config
loadAsset(config.configPath).then(function() {
	//merge config
	config = Object.assign(config, globalThis.FSCONFIG || {});
	globalThis.FSCONFIG = config;
	//set base
	loadAsset(config.basePath, 'base');
	//import map
	importMap(config.importMap);
	//load assets
	loadAsset(config.loadAssets).then(function() {
		//run ready callback?
		if(typeof config.readyCb == 'function') {
			config.readyCb(fstage);
		}
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