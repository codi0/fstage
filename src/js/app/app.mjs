//imports
import { env, importr } from '../fstage/fstage.mjs';
import utils from '../utils/utils.mjs';
import components from './components.mjs';

//private vars
const appCache = {};

//exports
export default function app(config = {}) {

	//get app name
	if(typeof config === 'string') {
		config = { id: config };
	} else if(!config.id) {
		config.id = 'default';
	}

	//is cached?
	if(appCache[config.id]) {
		return appCache[config.id];
	}

	//private vars
	const evPrefix = 'app.' + config.id + '.';
	const status = { init: false, mount: false, ready: false, waiting: [] };

	//public instance
	const app = appCache[config.id] = {};

	//app config
	app.config = Object.assign({
		debug: true,
		modules: [],
		routes: {},
		urlScheme: 'hash',
		rootEl: '#root',
		rootComponent: 'root'
	}, globalThis.__APPCONFIG, config);

	//update host?
	if(app.config.host) {
		env.host = app.config.host;
		delete app.config.host;
	}

	//update base path?
	if(app.config.basePath) {
		env.basePath = app.config.basePath.replace(/\/$/g, '') + '/';
		delete app.config.basePath;
	}
	
	//app routes
	app.routes = app.config.routes;
	delete app.config.routes;

	//imports
	app.env = env;
	app.utils = utils;
	app.components = components;
	
	//app logger
	app.logger = {
			
		track: function(name, params = {}) {
			return app.pubsub.emit(evPrefix + 'track', {
				name: name,
				params: params
			});
		},

		error: function(error, isFatal = false) {
			return this.track('exception', {
				exDescription: error,
				exFatal: false
			});
		},

		timer: function(name) {
			if(app.config.debug) {
				console.log(name + ':', Math.floor(performance.now()) + 'ms');
			}
		}

	};

	//app status
	app.status = {

		isOnline: function(wait = false) {
			//get result
			var res = app.db ? app.db.isOnline() : navigator.onLine;
			//return now?
			if(wait === false) {
				return res;
			}
			//wait for online
			return new Promise(function(resolve) {
				//check at intervals
				var tid = setInterval(function() {
					//is online now?
					if(app.status.isOnline()) {
						clearInterval(tid);
						resolve(true);
					}
				}, 100);
			});
		},

		isReady: function(wait = false) {
			//return now?
			if(wait === false) {
				return status.ready;
			}
			//wait for ready
			return new Promise(function(resolve) {
				//resolve now?
				if(status.ready) { 
					resolve(true);
				} else {
					app.pubsub.on(evPrefix + 'ready', function() {
						resolve(true);
					});
				}
			});
		},

		isWaiting: function(wait = false, opts = {}) {
			//return now?
			if(wait === false) {
				return status.waiting.length > 0;
			}
			//add to wait list?
			if(wait && wait !== true) {
				status.waiting.push(wait);
				wait = true;
			}
			//set vars
			var that = this;
			var count = status.waiting.length;
			//process promises
			var res = Promise.all(status.waiting).then(function() {
				//completed?
				if(status.waiting.length === count) {
					status.waiting = [];
					return opts.nested ? true : (count > 0);
				}
				//mark as nested
				opts.nested = true;
				//continue waiting
				return that.isWaiting(wait, opts);
			});
			//is online?
			if(!opts.waitOffline && !that.isOnline()) {
				return Promise.resolve([]);
			}
			//return
			return res;
		}

	};

	//app listeners
	app.on = {

		init: function(fn) {
			return status.init ? fn(app) : app.pubsub.on(evPrefix + 'init', fn);
		},

		mount: function(fn) {
			return status.mount ? fn(app) : app.pubsub.on(evPrefix + 'mount', fn);
		},

		ready: function(fn) {
			return status.ready ? fn(app) : app.pubsub.on(evPrefix + 'ready', fn);
		},

		download: function(fn) {
			return app.on.mount(function() {
				app.env.isWaiting(true).then(function(didWait) {
					fn(didWait);
				});
			});
		},

		track: function(fn) {
			return app.pubsub.on(evPrefix + 'track', fn);
		},

		update: function(fn) {
			return globalThis.addEventListener('swUpdate', fn);
		}
	
	};

	//app mount
	app.mount = function(rootEl, callback = null) {
		//find app root?
		if(typeof rootEl === 'string') {
			rootEl = document.querySelector(rootEl);
		}
		//update app props
		app.config.rootEl = rootEl;
		app.pubsub = app.components.pubsub();
		app.router = app.components.router();
		//mark as init
		status.init = true;
		//run init event
		app.pubsub.emit(evPrefix + 'init', app);
		//import modules
		importr(app.config.modules, { tpl: app.env.basePath + "js/{name}.mjs", meta: true }).then(function(results) {
			//set vars
			var services = [];
			var middleware = [];
			//loop through results
			results.forEach(function(module) {
				//parse name
				var name = module.path.replace(app.env.basePath + 'js/', '').replace('.min', '').replace('.mjs', '');
				var split = name.split("/", 2);
				//has default?
				if(module.exports.default) {
					var n = split[1].replace(/\/./g, function(m) { m[1].toUpperCase() });
					module.exports[n] = module.exports.default;
					delete module.exports.default;
				}
				//is util?
				if(split[0] === 'utils') {
					for(var i in module.exports) {
						app.utils[i] = module.exports[i];
					}
				}
				//is service?
				if(split[0] === 'services') {
					for(var i in module.exports) {
						app[i] = module.exports[i];
						services.push(i);
					}
				}
				//is middleware?
				if(split[0] === 'middleware') {
					for(var i in module.exports) {
						middleware.push(module.exports[i]);
					}				
				}
				//is component?
				if(split[0] === 'components') {
					for(var i in module.exports) {
						app.components.register(i, module.exports[i]);
					}
				}
			});
			//return
			return {
				services: services,
				middleware: middleware
			}
		}).then(function(data) {
			//start services
			data.services.forEach(function(name) {
				if(app[name].start) {
					app[name].start(app);
				}
			});
			//execute middleware
			data.middleware.forEach(function(fn) {
				fn(app.components.store(), app);
			});
			//register routes
			app.routes.forEach(function(route) {
				app.router.on(route, null);
			});
		}).then(function() {
			//execute callback?
			if(callback) {
				callback(app);
			}
			//start app
			app.components.start(app.config.rootComponent, app.config.rootEl, {
				context: app,
				router: {
					basePath: app.env.basePath,
					urlScheme: app.config.urlScheme,
					defHome: app.routes.HOME,
					def404: app.routes.NOTFOUND
				}
			});
			//mark as mounted
			status.mount = true;
			//run mount event
			app.pubsub.emit(evPrefix + 'mount', app);
			//log mount time
			app.logger.timer('App mounted');
			//onready callback
			var onReady = function() {
				//mark as ready
				status.ready = true;
				//run ready event
				app.pubsub.emit(evPrefix + 'ready', app);
				//log ready time
				app.logger.timer('Device ready');
			};
			//is device ready?
			if(app.env.isHybrid) {
				document.addEventListener('deviceready', onReady);
			} else {
				onReady();
			}
		});
		//return
		return app;
	};

	//capture errors
	globalThis.addEventListener('error', function(e) {
		app.logger.error(e.error);
	});

	//return
	return app;
}