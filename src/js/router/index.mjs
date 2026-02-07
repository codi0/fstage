// Private cache
const _cache = {};

// Router factory
export function createRouter(opts = {}) {
	
	// Config with defaults
	opts = Object.assign({
		name: 'default',
		state: {},
		routes: {},
		middleware: {},
		histId: 0,
		def404: null,
		defHome: null,
		urlScheme: 'hash',
		basePath: '/'
	}, opts);

	// Return cached instance
	if (_cache[opts.name]) {
		return _cache[opts.name];
	}

	let _started = false;
	let _listeners = [];
	let _popstateFired = false;
	let _backPending = false;

	// Normalize basePath helper
	function normalizePath(path) {
		path = path || '/';
		if (path[0] !== '/') path = '/' + path;
		if (path.length > 1 && path[path.length - 1] === '/') path = path.slice(0, -1);
		return path;
	}

	// Extract route from URL
	function getCurrentRoute() {
		const scheme = opts.urlScheme;
		
		if (scheme === 'hash') {
			return location.hash.slice(1) || '';
		}
		
		if (scheme === 'query') {
			return new URL(location.href).searchParams.get('route') || '';
		}
		
		// Path scheme (handle Capacitor schemes)
		let path = location.pathname || '/';
		const isHybrid = location.protocol === 'capacitor:' || location.protocol === 'file:';
		
		if (isHybrid) {
			// Capacitor uses index.html path
			path = path.replace(/\/index\.html.*$/, '/');
		}
		
		// Strip basePath
		if (path.startsWith(opts.basePath)) {
			path = path.slice(opts.basePath.length);
		}
		
		// Clean
		return path.replace(/^\/+|\/+$/g, '') || '';
	}

	// API
	const api = {

		start(merge = {}) {
			if (_started) return this;
			_started = true;

			// Merge options
			opts = Object.assign(opts, merge);
			opts.basePath = normalizePath(opts.basePath);

			// Validate 404 route if specified
			if (opts.def404 && !opts.routes[opts.def404]) {
				console.warn(`Router: def404 route "${opts.def404}" not defined`);
				opts.def404 = null;
			}

			// Popstate handler
			const onPopstate = e => {
				if (!e.state?.name || !_started) return;

				// Mark that popstate fired
				_popstateFired = true;
				_backPending = false;

				// Same route? Skip
				if (opts.defHome === opts.state.name && e.state.name === opts.state.name) {
					return;
				}

				// Determine direction from ID
				const direction = (typeof e.state.id === 'number' && e.state.id < opts.histId)
					? 'back' : 'forward';

				const data = {
					id: e.state.id,
					params: e.state.params,
					isBack: direction === 'back',
					scroll: e.state.scroll,
					actionType: 'history',
					direction
				};

				opts.histId = e.state.id ?? opts.histId;
				api.trigger(e.state.name, data, null);
			};

			// Hash change handler
			const onHashchange = () => {
				if (!_started || opts.urlScheme !== 'hash') return;
				const hash = location.hash.slice(1) || opts.defHome;
				if (hash && hash !== opts.state.name) {
					api.trigger(hash, { actionType: 'hash', direction: 'forward' }, null);
				}
			};
			
			const getRouteName = (el) => {
				let url = el.getAttribute('data-route') || el.getAttribute('data-href') || el.getAttribute('href');
				return url;
			};

			// Click handler
			const onClick = e => {
				if (e.defaultPrevented || !_started) return;
				
				const el = e.target.closest('[data-route], [data-href], [href]');
				if (!el) return;

				const name = getRouteName(el);
				const mode = el.getAttribute('data-history') || 'push';
				const params = (el.getAttribute('data-params') || '').split(';');
				
				if (!name) return;

				if (name === 'back') {
					e.preventDefault();
					return api.back();
				}

				const data = {
					params: {},
					actionType: 'click',
					direction: mode === 'replace' ? 'replace' : 'forward'
				};

				// Parse params
				params.forEach(p => {
					const [k, v] = p.split(':', 2);
					if (v !== undefined) {
						data.params[k.trim()] = v.trim();
					}
				});

				// Form submit?
				if (el.type === 'submit') {
					const form = el.closest('form');
					if (form && !form.dataset.routerBound) {
						form.dataset.routerBound = 'true';
						form.addEventListener('submit', e => {
							e.preventDefault();
							// Re-read from button at submit time
							const btn = e.submitter || el;
							const submitName = getRouteName(btn);
							const submitMode = btn.getAttribute('data-history') || 'push';
							const submitParams = (btn.getAttribute('data-params') || '').split(';');
							const submitData = { params: {}, actionType: 'submit', direction: submitMode === 'replace' ? 'replace' : 'forward' };
							submitParams.forEach(p => {
								const [k, v] = p.split(':', 2);
								if (v !== undefined) submitData.params[k.trim()] = v.trim();
							});
							api.trigger(submitName, submitData, submitMode);
						});
						return;
					}
				}

				e.preventDefault();
				api.trigger(name, data, mode);
			};

			// Register listeners
			addEventListener('popstate', onPopstate);
			addEventListener('hashchange', onHashchange);
			addEventListener('click', onClick);

			_listeners.push(
				{ type: 'popstate', fn: onPopstate },
				{ type: 'hashchange', fn: onHashchange },
				{ type: 'click', fn: onClick }
			);

			// Capacitor native back button
			if (globalThis.Capacitor?.Plugins?.App) {
				const backHandler = () => api.back();
				Capacitor.Plugins.App.addListener('backButton', backHandler);
				_listeners.push({ 
					type: 'capacitor', 
					fn: backHandler,
					cleanup: () => Capacitor.Plugins.App.removeListener('backButton', backHandler)
				});
			}

			// Initial route
			const route = getCurrentRoute() || opts.defHome;
			if (route) {
				api.trigger(route, {
					init: true,
					actionType: 'init',
					direction: 'replace'
				}, 'replace');
			}

			return this;
		},

		destroy() {
			_started = false;
			_listeners.forEach(l => {
				if (l.cleanup) {
					l.cleanup();
				} else {
					removeEventListener(l.type, l.fn);
				}
			});
			_listeners = [];
			delete _cache[opts.name];
		},

		is(route) {
			return opts.state.name === route;
		},

		has(name) {
			return name in opts.routes;
		},

		current(key = null) {
			return key ? (opts.state[key] ?? null) : { ...opts.state };
		},

		on(route, fn) {
			if (route?.[0] === ':') {
				opts.middleware[route] = opts.middleware[route] || [];
				opts.middleware[route].push(fn);
			} else {
				opts.routes[route] = fn;
			}
		},

		trigger(name, data = {}, mode = 'push') {
			// Build route (merge data first)
			const route = {
				...data,
				name,
				orig: name,
				params: data.params || {},
				mode,
				actionType: data.actionType || 'trigger',
				direction: data?.direction || (data?.isBack ? 'back' : (mode === 'replace' ? 'replace' : 'forward')),
				action: opts.routes[name],
				last: opts.state.name || null,
				lastParams: opts.state.params || null,
				is404: !this.has(name)
			};

			// Handle 404
			if (route.is404) {
				route.name = opts.def404;
				if (!this.has(route.name)) return false;
				route.action = opts.routes[route.name];
			}

			const last = opts.state.name;
			let routeName = route.name;
			const cycles = [':before', ':all', routeName, ':after'];

			// Execute middleware pipeline
			for (let i = 0; i < cycles.length; i++) {
				const id = cycles[i];
				const listeners = (id === routeName) 
					? [route.action] 
					: (opts.middleware[id] || []);

				for (let j = 0; j < listeners.length; j++) {
					const fn = listeners[j];
					if (typeof fn !== 'function') continue;

					const result = fn(route);

					// Break early
					if (result === false || last !== opts.state.name) {
						return false;
					}

					// Track runs
					if (i === 2) {
						fn.runs = (fn.runs || 0) + 1;
					}

					// Route redirect
					if (result?.name && i < 3) {
						route.name = result.name;
						routeName = result.name;
						cycles[2] = routeName;
						route.action = result.action || opts.routes[routeName];
						Object.assign(route, result);
					}
				}
			}

			// Update state
			return this.setState(route, mode);
		},

		redirect(name, data = {}) {
			data.actionType = data.actionType || 'redirect';
			data.direction = data.direction || 'replace';
			return this.trigger(name, data, 'replace');
		},

		refresh() {
			if (opts.state.name) {
				return this.trigger(opts.state.name, { actionType: 'refresh' }, null);
			}
		},

		back() {
			// Prevent rapid back() spam
			if (_backPending) return;
			
			_backPending = true;
			_popstateFired = false;
			history.back();
			
			// Fallback if popstate doesn't fire (50ms = industry standard for hybrid)
			setTimeout(() => {
				if (!_popstateFired) {
					// Popstate didn't fire, just refresh current route
					this.refresh();
				}
				_popstateFired = false;
				_backPending = false;
			}, 50);
		},

		setState(state, mode = 'replace') {
			// Set ID
			if (mode === 'push') {
				state.id = ++opts.histId;
			} else if (mode === 'replace') {
				state.id = state.id ?? opts.state.id ?? ++opts.histId;
			} else {
				// null mode = no history change (refresh/manual trigger)
				state.id = state.id ?? opts.state.id ?? opts.histId;
			}

			// Cache scroll
			state.scroll = state.scroll ?? (globalThis.pageYOffset || 0);

			// Merge state (preserve existing properties)
			opts.state = { ...opts.state, ...state };

			// Update browser history
			if (mode && history[mode + 'State']) {
				let url = '';
				let name = opts.state.name;
				let title = opts.state.title || document.title || '';

				if (state.is404 && state.orig) {
					name = state.orig;
				}

				if (opts.urlScheme === 'hash') {
					url = new URL(location.href);
					url.hash = (name === opts.defHome) ? '' : name;
					url = url.toString();
				} else if (opts.urlScheme === 'query') {
					url = new URL(location.href);
					if (name === opts.defHome) {
						url.searchParams.delete('route');
					} else {
						url.searchParams.set('route', name);
					}
					url = url.toString();
				} else if (opts.urlScheme === 'path') {
					url = opts.basePath + (name === opts.defHome ? '' : '/' + name);
				}
				
				if (url) {
					url = url.replace(/([^:]\/)\/+/g, '$1');
				}

				history[mode + 'State'](opts.state, title, url);
				document.title = title;
			}

			return this.current();
		}
	};

	_cache[opts.name] = api;

	return api;
}