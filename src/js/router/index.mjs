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
		defHome: '/',
		def404: '/',
		scroller: null
	}, opts);

	let _started = false;
	let _popstateFired = false;
	let _backPending = false;

	// Normalize basePath helper
	function normalizePath(path) {
		path = path || '/';
		if (path[0] !== '/') path = '/' + path;
		if (path.length > 1 && path[path.length - 1] === '/') path = path.slice(0, -1);
		return path;
	}

	// Normalize route to slash-prefixed format (industry standard)
	function normalizeRoute(route, def = '/') {
		route = (route || '').trim();

		// Ensure leading slash
		if (route && route[0] !== '/') {
			route = '/' + route;
		}
		
		// Remove trailing slash
		if (route && route[route.length - 1] === '/') {
			route = route.slice(0, -1);
		}
		
		return route ? route : def;
	}

	// Parse route pattern to regex
	function parsePattern(pattern) {
		const paramNames = [];
		const regexPattern = pattern.split('/').map(function(segment) {
			if (segment.startsWith(':')) {
				const paramName = segment.slice(1);
				paramNames.push(paramName);
				return '([^/]+)';
			}
			return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}).join('\\/');
		
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
				paramNames.forEach(function(name, i) {
					params[name] = match[i + 1];
				});
				return { name: pattern, params };
			}
		}
		
		return null;
	}

	// Get route from URL (raw extraction, no normalization)
	function getRouteFromUrl() {
		let route = null;

		const scheme = opts.urlScheme;
		const isHybrid = location.protocol === 'capacitor:' || location.protocol === 'file:';
		
		if (scheme === 'hash') {
			route = location.hash.slice(1) || '';
		} else if (scheme === 'query') {
			route = new URL(location.href).searchParams.get('route') || '';
		} else {
			route = location.pathname || '/';
			
			if (isHybrid) {
				route = route.replace(/\/index\.html.*$/, '/');
			}
			
			if (route.startsWith(opts.basePath)) {
				route = route.slice(opts.basePath.length);
			}
		}

		// Return raw route or default - trigger() will normalize
		return route || opts.defHome || '/';
	}

	// Get route from el
	function getRouteFromEl(el) {
		return {
			name: el.getAttribute('data-route') || el.getAttribute('data-href') || el.getAttribute('href'),
			mode: el.hasAttribute('data-replace') ? 'replace' : 'push',
			params: el.getAttribute('data-params') ? el.getAttribute('data-params').split(';') : []
		};
	}

	// Click handler
	function onClick(e) {
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

		const route = getRouteFromEl(el);
		const data = { params: {}, action: 'click' };

		if (route.name === 'back') {
			e.preventDefault();
			return history.back();
		} else if (!route.name) {
			return;
		}

		// Parse params
		route.params.forEach(function(p) {
			const [k, v] = p.split(':', 2);
			if (v !== undefined) {
				data.params[k.trim()] = v.trim();
			}
		});

		// Form submit?
		if (el.type === 'submit') {
			// Find form
			let form = null;
			if (e.composedPath) {
				form = e.composedPath().find(function(node) {
					return node.tagName === 'FORM';
				});
			} else {
				form = el.closest('form');
			}
			// Bind form to router
			if (form && !form.dataset.routerBound) {
				form.dataset.routerBound = 'true';
				form.addEventListener('submit', function(e) {
					e.preventDefault();
					// Re-read from button at submit time
					const btn = e.submitter || el;
					const submit = getRouteFromEl(btn);
					const submitData = { params: {}, action: 'submit' };
					if(submit.name) {
						submit.params.forEach(function(p) {
							const [k, v] = p.split(':', 2);
							if (v !== undefined) {
								submitData.params[k.trim()] = v.trim();
							}
						});
						api.trigger(submit.name, submitData, submit.mode);
					}
				});
				return;
			}
		}

		e.preventDefault();
		api.trigger(route.name, data, route.mode);
	}

	// Popstate handler
	function onPopstate(e) {
		if (!e.state || !e.state.id || !e.state.name) return;

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
	}
			
	// Scroll handler
	function onScroll(e) {
		const target = e.composedPath ? e.composedPath()[0] : e.target;

		if (onScroll._tid) clearTimeout(onScroll._tid);

		onScroll._tid = setTimeout(function() {
			opts.state.scroll = target.scrollTop || 0;
			history.replaceState(opts.state, '', location.href);
		}, 100);
	}

	// API
	const api = {

		start(merge = {}) {
			if (_started) return;
			_started = true;

			// Merge options
			opts = Object.assign(opts, merge);
			
			// Normalize paths
			opts.basePath = normalizePath(opts.basePath);
			opts.defHome = normalizeRoute(opts.defHome);
			opts.def404 = normalizeRoute(opts.def404);

			// Click listener
			document.addEventListener('click', onClick);
			
			// Popstate listener
			globalThis.addEventListener('popstate', onPopstate);
			
			// Scroll listener
			if (opts.scroller) {
				opts.scroller.addEventListener('scroll', onScroll);
			}

			// get Route name
			const route = getRouteFromUrl();
			console.log(route);
			
			//Trigger?
			if (route) {
				const data = { action: 'init' };
				api.trigger(route, data, 'replace');
			}
		},

		destroy() {
			_started = false;

			// Click listener
			document.removeEventListener('click', onClick);
			
			// Popstate listener
			globalThis.removeEventListener('popstate', onPopstate);
			
			// Scroll listener
			if (opts.scroller) {
				opts.scroller.removeEventListener('scroll', onScroll);
			}
			
			// Clear form binding flags
			document.querySelectorAll('form[data-router-bound]').forEach(function(f) {
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
			// Normalize the incoming route name (SINGLE normalization point)
			name = normalizeRoute(name);
			
			// Match route pattern
			const matched = matchRoute(name);
			
			// Build route (merge data first)
			const route = {
				...data,
				mode: mode,
				path: name,  // The actual path that was navigated to
				name: matched?.name || name,  // The route pattern or exact match
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

				if (!this.has(route.name)) {
					return false;
				}
			}

			let result = false;
			let routeName = route.name;
			const last = opts.state.name;
			const cycles = [ ':before', ':after' ];

			// Don't re-trigger same route
			if (last === routeName) {
				return result;
			}

			// Execute middleware pipeline
			for (let i = 0; i < cycles.length; i++) {
				const id = cycles[i];
				const listeners = opts.middleware[id] || [];
				
				if (id === ':after') {
					result = this.setState(route, mode);
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
							route.name = normalizeRoute(tmp.name);
							routeName = route.name;
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
				return this.trigger(opts.state.path || opts.state.name, data, null);
			}
		},

		back() {
			// Prevent rapid back() spam
			if (_backPending) return;
			
			_backPending = true;
			_popstateFired = false;
			history.back();
			
			// Fallback if popstate doesn't fire (50ms = industry standard for hybrid)
			setTimeout(function() {
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

			// Replace state completely (no merge)
			opts.state = state;

			// Update browser history
			if (mode && history[mode + 'State']) {
				let url = '';
				let path = state.path || state.name;

				if (opts.urlScheme === 'hash') {
					// Hash mode: path is already "/users", set hash to "/users" ? #/users
					url = new URL(location.href);
					url.hash = (path === opts.defHome) ? '' : path;
					url = url.toString();
				} else if (opts.urlScheme === 'query') {
					// Query mode: keep slash in query param ? ?route=/users
					url = new URL(location.href);
					if (path === opts.defHome) {
						url.searchParams.delete('route');
					} else {
						url.searchParams.set('route', path);
					}
					url = url.toString();
				} else if (opts.urlScheme === 'path') {
					// Path mode: basePath + path (path already has leading slash)
					// e.g., "/app" + "/users" = "/app/users"
					url = opts.basePath + (path === opts.defHome ? '' : path);
				}
				
				// Clean up any accidental double slashes (but preserve protocol://)
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