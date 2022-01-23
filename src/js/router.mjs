//imports
import { env } from './core.mjs';

//router wrapper
function rtr(opts = {}) {

	//config opts
	opts = Object.assign({
		state: {},
		routes: {},
		middleware: {},
		histId: 0,
		isBack: false,
		def404: null,
		defHome: null,
		basePath: null,
		urlScheme: 'path'
	}, opts);

	//set flags
	var _started = false;

	//public api
	var api = {

		instance: function(opts = {}) {
			return new rtr(opts);
		},

		start: function(merge = {}) {
			//set vars
			var route = '';
			//has started?
			if(!_started) {
				//update flag
				_started = true;
				//merge opts
				opts = Object.assign(opts, merge);
				//guess base path?
				if(!opts.basePath) {
					opts.basePath = env.basePath;
				}
				//hash url?
				if(opts.urlScheme === 'hash') {
					route = location.hash.replace('#', '');
				}
				//query url?
				if(opts.urlScheme === 'query') {
					route = new URL(location.href).searchParams.get('route');
				}
				//path url?
				if(opts.urlScheme === 'path') {
					route = location.href.split('?')[0].replace(opts.basePath, '').replace(/^\/|\/$/g, '');
				}
				//listen for nav change
				globalThis.addEventListener('popstate', function(e) {
					//valid state?
					if(!e.state || !e.state.name || !_started) {
						opts.isBack = false;
						return;
					}
					//already home?
					if(opts.defHome === opts.state.name && e.state.name === opts.state.name) {
						opts.isBack = false;
						return;
					}
					//set vars
					var goBack = (opts.isBack || opts.histId > e.state.id || (e.state.id - opts.histId) > 1);
					var data = { id: e.state.id, params: e.state.params, isBack: goBack, scroll: e.state.scroll };
					//reset cache
					opts.isBack = false;
					opts.histId = e.state.id;
					//trigger route (no history)
					api.trigger(e.state.name, data, null);
				});
				//listen for hash changes
				globalThis.addEventListener('hashchange', function(e) {
					//has started?
					if(!_started) return;
					//get current hash
					var hash = location.hash.replace('#', '') || opts.defHome;
					//trigger new route?
					if(hash && hash !== opts.state.name && opts.urlScheme === 'hash') {
						api.trigger(hash);
					}
				});
				//listen for clicks
				globalThis.addEventListener('click', function(e) {
					//get target
					var el = e.target.closest('[data-route]');
					//valid route?
					if(!el || !_started) return;
					//get params
					var name = el.getAttribute('data-route');
					var mode = el.getAttribute('data-history') || 'push';
					var params = (el.getAttribute('data-params') || '').split(';');
					//go back?
					if(name === 'back') {
						return api.back();
					}
					//stop here?
					if(!name) return;
					//set data
					var data = {
						params: {}
					};
					//parse params
					for(var i=0; i < params.length; i++) {
						//split into key/value pair
						var tmp = params[i].split(':', 2);
						//valid pair?
						if(tmp.length > 1) {
							data.params[tmp[0].trim()] = tmp[1].trim();
						}
					}
					//is form submit?
					if(el.getAttribute('type') === 'submit') {
						//check for form
						var form = el.closest('form');
						//form found?
						if(form) {
							//listen to form submit
							return form.addEventListener('submit', function(e) {
								//prevent default
								e.preventDefault();
								//trigger route
								api.trigger(name, data, mode);
							});
						}
					}
					//prevent default
					e.preventDefault();
					//trigger route
					api.trigger(name, data, mode);
				});
				//has route?
				if(route || opts.defHome) {
					api.trigger(route || opts.defHome, {
						init: true
					}, 'replace');
				}
			}
			//return
			return this;
		},

		is: function(route) {
			return opts.state.name === route;
		},

		has: function(name) {
			return (name in opts.routes);
		},

		current: function(key = null) {
			return key ? (opts.state[key] || null) : Object.assign({}, opts.state);
		},

		on: function(route, fn) {
			//is middleware?
			if(route && route[0] === ':') {
				opts.middleware[route] = opts.middleware[route] || [];
				opts.middleware[route].push(fn);
			} else {
				opts.routes[route] = fn;
			}
		},

		trigger: function(name, data = {}, mode = 'push') {
			//create route
			var route = Object.assign({
				name: name,
				orig: name,
				params: {},
				mode: mode,
				action: opts.routes[name],
				last: opts.state.name || null,
				lastParams: opts.state.params || null,
				is404: !this.has(name)
			}, data);
			//is 404?
			if(route.is404) {
				//update name
				route.name = opts.def404;
				//stop here?
				if(!this.has(route.name)) {
					return false;
				}
			}
			//set vars
			var last = opts.state.name;
			var cycles = [ ':before', ':all', name, ':after' ];
			//loop through cycles
			for(var i=0; i < cycles.length; i++) {
				//set vars
				var id = cycles[i];
				var listeners = (id === name) ? [ route.action ] : (opts.middleware[id] || []);
				//loop through listeners
				for(var j=0; j < listeners.length; j++) {
					//get listener
					var fn = listeners[j];
					//is function?
					if(typeof fn !== 'function') {
						continue;
					}
					//call listener
					var tmp = fn(route);
					//break early?
					if(tmp === false || last !== opts.state.name) {
						return false;
					}
					//count runs?
					if(i === 2) {
						fn.runs = fn.runs || 0;
						fn.runs++;
					}
					//update route?
					if(tmp && tmp.name && i < 3) {
						route = tmp;
						cycles[2] = tmp.name;
					}
				}
			}
			//update state
			return this.setState(route, mode, true);
		},

		redirect: function(name, data = {}) {
			return this.trigger(name, data, 'replace');
		},

		refresh: function() {
			//can refresh?
			if(opts.state.name) {
				return this.trigger(opts.state.name, {}, null);
			}
		},

		back: function() {
			//set vars
			var that = this;
			opts.isBack = true;
			//try history
			history.back();
			//set fallback
			setTimeout(function() {
				//stop here?
				if(!opts.isBack) return;
				//trigger back
				that.trigger(opts.state.name || opts.defHome, {
					isBack: true,
					params: opts.state.params || {}
				}, null);
			}, 400);
		},

		setState: function(state, mode = 'replace', reset = false) {
			//set ID
			if(mode === 'push') {
				state.id = (++opts.histId);
			} else {
				state.id = state.id || opts.state.id || (++opts.histId);
			}
			//cache scroll position
			state.scroll = ('scroll' in state) ? (state.scroll || 0) : globalThis.pageYOffset;
			//reset?
			if(reset) {
				opts.state = {};
			}
			//update props
			for(var i in state) {
				if(state.hasOwnProperty(i)) {
					opts.state[i] = state[i];
				}
			}
			//update history?
			if(globalThis.history && mode && history[mode + 'State']) {
				//set vars
				var url = '';
				var name = opts.state.name;
				var title = opts.state.title || '';
				//is 404?
				if(state.is404 && state.orig) {
					name = state.orig;
				}
				//hash url?
				if(opts.urlScheme === 'hash') {
					url = new URL(location.href);
					url.hash = (name == opts.defHome) ? '' : name;
					url = url.toString();
				}
				//query url?
				if(opts.urlScheme === 'query') {
					url = new URL(location.href);
					url.searchParams[name == opts.defHome ? 'delete' : 'set']('route', name);
					url = url.toString();
				}
				//path url?
				if(opts.urlScheme === 'path') {
					url = opts.basePath + (name == opts.defHome ? '' : name);
				}
				//update history
				history[mode + 'State'](opts.state, title, url);
			}
			//return
			return this.current();
		},

	};

	return api;

};

//export instance
export const router = new rtr();