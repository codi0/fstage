//router factory
export function createRouter(opts = {}) {
	
	// Config with defaults
	opts = Object.assign({
		state: {},
		routes: {},
		middleware: {},
		basePath: '/',
		urlScheme: 'hash',
		histId: 0,
		def404: null,
		defHome: null,
		scroller: null
	}, opts);

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

	// Parse route pattern to regex
	function parsePattern(pattern) {
		const paramNames = [];
		const regexPattern = pattern
			.split('/')
			.map(segment => {
				if (segment.startsWith(':')) {
					const paramName = segment.slice(1);
					paramNames.push(paramName);
					return '([^/]+)';
				}
				return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			})
			.join('\\/');
		
		return {
			regex: new RegExp(`^${regexPattern}$`),
			paramNames
		};
	}

	// Match route and extract params
	function matchRoute(path) {
		// Exact match first
		if (path in opts.routes) {
			return { name: path, params: {} };
		}
		
		// Pattern match
		for (const pattern in opts.routes) {
			if (!pattern.includes(':')) continue;
			
			const { regex, paramNames } = parsePattern(pattern);
			const match = path.match(regex);
			
			if (match) {
				const params = {};
				paramNames.forEach((name, i) => {
					params[name] = match[i + 1];
				});
				return { name: pattern, params };
			}
		}
		
		return null;
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
			
			const getRouteName = (el) => {
				let url = el.getAttribute('data-route') || el.getAttribute('data-href') || el.getAttribute('href');
				return url;
			};

			// Click handler
			const onClick = e => {
				if (e.defaultPrevented || !_started) return;
				
				let el = null;
				const selector = '[data-route], [data-href], [href]';

				if(e.composedPath) {
					const path = e.composedPath();
					if (!path) return;
					el = path.find(function(node) {
						return (node instanceof Element) && node.matches(selector);
					});
				} else if (e.target instanceof Element) {
					el = e.target.closest(selector);
				}
				
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
					action: 'click'
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
					// Find form via composed path or closest
					let form = null;
					if (e.composedPath) {
						form = e.composedPath().find(node => node.tagName === 'FORM');
					} else {
						form = el.closest('form');
					}
					
					if (form && !form.dataset.routerBound) {
						form.dataset.routerBound = 'true';
						form.addEventListener('submit', e => {
							e.preventDefault();
							// Re-read from button at submit time
							const btn = e.submitter || el;
							const submitName = getRouteName(btn);
							const submitMode = btn.getAttribute('data-history') || 'push';
							const submitParams = (btn.getAttribute('data-params') || '').split(';');
							const submitData = { params: {}, action: 'submit' };
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

			// Popstate handler
			const onPopstate = e => {
				if (!_started || !e.state || !e.state.id || !e.state.name) return;

				// Mark that popstate fired
				_popstateFired = true;
				_backPending = false;

				const data = {
					id: e.state.id,
					action: 'history',
					params: e.state.params,
					scroll: e.state.scroll || 0,
					isBack: e.state.id < opts.histId
				};

				opts.histId = e.state.id;

				api.trigger(e.state.name, data, null);
			};
			
			// Scroll handler
			const onScroll = e => {
				const target = e.composedPath ? e.composedPath()[0] : e.target;
				if (onScroll._tid) clearTimeout(onScroll._tid);
				onScroll._tid = setTimeout(function() {
					opts.state.scroll = target.scrollTop || 0;
					history.replaceState(opts.state, '', location.href);
				}, 100);
			};

			// Click listener
			document.addEventListener('click', onClick);
			_listeners.push(() => document.removeEventListener('click', onClick));
			
			// Popstate listener
			globalThis.addEventListener('popstate', onPopstate);
			_listeners.push(() => globalThis.removeEventListener('popstate', onPopstate));
			
			// Scroll listener
			if (opts.scroller) {
				opts.scroller.addEventListener('scroll', onScroll);
				_listeners.push(() => opts.scroller.removeEventListener('scroll', onScroll));
			}

			// Capacitor native back button
			if (globalThis.Capacitor?.Plugins?.App) {
				const backHandler = () => api.back();
				Capacitor.Plugins.App.addListener('backButton', backHandler);
				_listeners.push(() => Capacitor.Plugins.App.removeListener('backButton', backHandler));
			}

			// Initial route
			const route = getCurrentRoute() || opts.defHome;
			if (route) {
				const data = { action: 'init' };
				api.trigger(route, data, 'replace');
			}

			return this;
		},

		destroy() {
			_started = false;
			_listeners.forEach(fn => {
				fn();
			});
			_listeners = [];
			
			// Clear form binding flags
			document.querySelectorAll('form[data-router-bound]').forEach(f => {
				delete f.dataset.routerBound;
			});
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
			opts.middleware[route] = opts.middleware[route] || [];
			opts.middleware[route].push(fn);
		},

		trigger(name, data = {}, mode = 'push') {
			// Match route pattern
			const matched = matchRoute(name);
			
			// Build route (merge data first)
			const route = {
				...data,
				mode: mode,
				orig: name,
				name: matched?.name || name,
				params: { ...(matched?.params || {}), ...(data.params || {}) },
				lastName: opts.state.name || null,
				lastParams: opts.state.params || {},
				is404: !matched && !this.has(name),
				isBack: !!data.isBack,
				action: data.action || 'trigger'
			};

			// Handle 404
			if (route.is404) {
				route.name = opts.def404;
				if (!this.has(route.name)) return false;
			}

			let result = false;
			let routeName = route.name;
			const last = opts.state.name;
			const cycles = [ ':before', ':after' ];

			if (last === routeName) {
				return result;
			}

			// Execute middleware pipeline
			for (let i = 0; i < cycles.length; i++) {
				const id = cycles[i];
				const listeners = opts.middleware[id] || [];
				
				if (id === ':after') {
					result = this.setState(route, mode);
					console.log(result);
					if (opts.middleware[routeName]) {
						listeners.push(...opts.middleware[routeName]);
					}
				}

				for (let j = 0; j < listeners.length; j++) {
					const fn = listeners[j];
					if (typeof fn !== 'function') continue;

					const tmp = fn(route);

					// Break early
					if (tmp === false || last !== opts.state.name) {
						return false;
					}

					// Track runs
					fn.runs = (fn.runs || 0) + 1;

					// Route redirect?
					if (result === false) {
						if (tmp && tmp.name) {
							route.name = tmp.name;
							routeName = tmp.name;
							Object.assign(route, tmp);
						}
					}
				}
			}

			// Update state
			return result;
		},

		redirect(name, data = {}) {
			data.action = data.action || 'redirect';
			return this.trigger(name, data, 'replace');
		},

		refresh() {
			if (opts.state.name) {
				const data = { action: 'refresh', params: opts.state.params || {} };
				return this.trigger(opts.state.orig || opts.state.name, data, null);
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
					// Popstate didn't fire - already at history start, do nothing (standard browser behavior)
					_backPending = false;
				}
				_popstateFired = false;
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

			// Merge state (preserve existing properties)
			opts.state = { ...opts.state, ...state };

			// Update browser history
			if (mode && history[mode + 'State']) {
				let url = '';
				let name = state.orig || opts.state.name;

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

				history[mode + 'State'](opts.state, '', url);
			}

			return this.current();
		}
	};

	return api;
}