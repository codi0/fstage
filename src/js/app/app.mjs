//imports
import { env } from '../core/index.mjs';
import utils from '../utils/index.mjs';
import dom from '../dom/index.mjs';
import pubsub from '../pubsub/index.mjs';
import router from './router.mjs';
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
	let lastRoute = '';
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
		pageTransition: 'bump-from-bottom'
	}, config);

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

	//imports
	app.env = env;
	app.utils = utils;
	app.router = router;
	app.pubsub = pubsub;
	app.components = components;
	
	//set debug
	components.debug = app.config.debug;

	//Helper: page transition before update
	components.onBeforeUpdateNode(function(from, to, rootEl) {
		//set vars
		var customEffects = {};
		var route = app.router.current();
		var component = from.getAttribute('data-component');
		var transition = from.getAttribute('data-transition');
		var isPage = app.router.has(component);
		var inReverse = isPage ? route.isBack : from.hasAttribute('data-reverse');
		//can transition?
		if(from === rootEl || (from.id && from.id === to.id) || (isPage && route.init) || (!isPage && !transition)) {
			return;
		}
		//route changed?
		if(lastRoute === route.name) {
			return;
		}
		//cache last route
		lastRoute = route.name;
		//set vars
		var fromEffect = 'none';
		var toEffect = transition || app.config.pageTransition;
		//check for custom effects
		for(var i in customEffects) {
			//effect found?
			if((inReverse ? from : to).getAttribute('data-component') === i) {
				toEffect = customEffects[i];
				break;
			}
		}
		//append node
		from.parentNode.insertBefore(to, from.nextSibling);
		//hide to node
		to.classList.add('hidden');
		//run page transition
		dom.transition(to, toEffect, from, fromEffect, {
			reverse: inReverse,
			onEnd: function(e) {
				//remove old node?
				if(from.parentNode) {
					from.parentNode.removeChild(from);
				}
			}
		});
		//break
		return false;
	});

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
		//update config
		app.config.rootEl = rootEl;
		//mark as init
		status.init = true;
		//run init event
		app.pubsub.emit(evPrefix + 'init', app);
		//set vars
		var proms = [];
		//loop through modules
		app.config.modules.forEach(function(path) {
			//use template?
			if(path.indexOf('.') === -1) {
				path = app.env.basePath + 'js/' + path + '.mjs';
			}
			//import module
			proms.push(import(path));
		});
		//wait for imports
		return Promise.all(proms).then(function(results) {
			//set vars
			var services = [];
			var middleware = [];
			//loop through results
			results.forEach(function(exports, index) {
				//get module name
				var name = app.config.modules[index];
				var split = name.split("/");
				//has default?
				if(exports.default) {
					var n = split[split.length-1].replace(/\/./g, function(m) { m[1].toUpperCase() });
					exports[n] = exports.default;
					delete exports.default;
				}
				//loop through exports
				for(var i in exports) {
					//is util?
					if(split[0] === 'utils') {
						app.utils[i] = exports[i];
					} else if(split[0] === 'services') {
						app[i] = exports[i];
						services.push(i);
					} else if(split[0] === 'middleware') {
						middleware.push(exports[i]);
					} else if(split[0] === 'views') {
						app.components.register(i, exports[i]);
					}
				}
			});
			//start services
			services.forEach(function(name) {
				if(app[name].start) {
					app[name].start(app);
				}
			});
			//execute middleware
			middleware.forEach(function(fn) {
				fn(app.components.store(), app);
			});
			//register routes
			app.config.routes.forEach(function(route) {
				app.router.on(route, null);
			});
			//execute callback?
			if(callback) {
				callback(app);
			}
			//listen for any route change
			app.router.on(':all', function(route) {
				//update global store
				app.components.store().state().merge({ route: route });
			});
			//start router
			app.router.start({
				basePath: app.env.basePath,
				urlScheme: app.config.urlScheme,
				defHome: app.config.routes.HOME,
				def404: app.config.routes.NOTFOUND
			});
			//start components
			app.components.start(app.config.rootEl, {
				context: app.config,
				pubsub: app.pubsub
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
			//done
			return app;
		});
	};

	//capture errors
	globalThis.addEventListener('error', function(e) {
		app.logger.error(e.error);
	});

	//return
	return app;
}