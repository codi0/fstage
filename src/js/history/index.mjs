// @fstage/history
//
// Responsibilities:
// - URL <-> route string translation
// - push / replace commits
// - popstate listening
// - event emission

function normalizePath(path) {
	path = path || '/';
	if (path[0] !== '/') path = '/' + path;
	if (path.length > 1 && path[path.length - 1] === '/') {
		path = path.slice(0, -1);
	}
	return path;
}

function normalizeRoute(route, defHome) {
	route = (route || '').trim();
	if (route && route[0] !== '/') route = '/' + route;
	if (route && route.length > 1 && route[route.length - 1] === '/') {
		route = route.slice(0, -1);
	}
	return route || defHome || '/';
}

function cleanDoubleSlashes(url) {
	return url.replace(/([^:]\/)\/+/g, '$1');
}

function getRouteFromUrl(opts) {
	var scheme = opts.urlScheme;
	var basePath = opts.basePath;
	var defHome = opts.defHome;
	var route = '';

	if (scheme === 'hash') {
		route = location.hash.slice(1) || '';
	} else if (scheme === 'query') {
		var u = new URL(location.href);
		route = u.searchParams.get('route') || '';
	} else {
		route = location.pathname || '/';

		if (basePath !== '/' && route.indexOf(basePath) === 0) {
			route = route.slice(basePath.length);
		}
	}

	return normalizeRoute(route, defHome);
}

function buildUrl(opts, route) {
	var scheme = opts.urlScheme;
	var basePath = opts.basePath;
	var defHome = opts.defHome;
	var path = normalizeRoute(route, defHome);
	var url = '';

	if (scheme === 'hash') {
		var u1 = new URL(location.href);
		u1.hash = (path === defHome) ? '' : path;
		url = u1.toString();
	} else if (scheme === 'query') {
		var u2 = new URL(location.href);
		if (path === defHome) {
			u2.searchParams.delete('route');
		} else {
			u2.searchParams.set('route', path);
		}
		url = u2.toString();
	} else {
		basePath = normalizePath(basePath || '/');
		var suffix = (path === defHome) ? '' : path;
		if (basePath[basePath.length - 1] === '/' && suffix[0] === '/') {
			suffix = suffix.slice(1);
		}
		url = basePath + suffix;
	}

	return cleanDoubleSlashes(url);
}

/**
 * Create a browser history adapter that translates between URLs and route strings,
 * wrapping the native `history` API with push, replace, and popstate support.
 *
 * Supports three URL schemes, controlled by `options.urlScheme`:
 *   - `'hash'`  — route stored in `location.hash` (default; no server config needed)
 *   - `'query'` — route stored as `?route=<path>` query parameter
 *   - `'path'`  — route stored in `location.pathname` (requires server-side fallback)
 *
 * @param {Object} [options]
 * @param {'hash'|'query'|'path'} [options.urlScheme='hash'] - URL encoding strategy.
 * @param {string} [options.basePath='/'] - Path prefix stripped/prepended in path mode.
 * @param {string} [options.defHome='/']  - Route treated as the home/root (omitted from URL).
 *
 * @returns {{
 *   location(): { route: string, state: Object, href: string },
 *   on(fn: Function): Function,
 *   off(fn: Function): void,
 *   push(route: string, state?: Object, opts?: Object): void,
 *   replace(route: string, state?: Object, opts?: Object): void,
 *   back(opts?: Object): void,
 *   forward(opts?: Object): void,
 *   go(n: number, opts?: Object): void,
 *   destroy(): void
 * }}
 *
 * Returned methods:
 *   - `location()` — snapshot of the current URL as `{ route, state, href }`.
 *   - `on(fn)` — subscribe to navigation events; returns an `off()` function.
 *   - `off(fn)` — unsubscribe.
 *   - `push/replace(route, state?, opts?)` — navigate and optionally emit silently.
 *   - `back/forward/go` — wrap `history.back/forward/go`. Pass `{ silent: true }` to
 *     suppress the next popstate emission.
 *   - `destroy()` — remove the internal `popstate` listener and clear listeners.
 */
export function createBrowserHistory(options) {
	options = options || {};

	var conf = {
		urlScheme: options.urlScheme || 'hash',
		basePath: normalizePath(options.basePath || '/'),
		defHome: normalizeRoute(options.defHome || '/')
	};

	var listeners = [];
	var silent = false;

	function snapshot() {
		return {
			route: getRouteFromUrl(conf),
			state: history.state || {},
			href: location.href
		};
	}

	function emit(e) {
		e.location = snapshot();
		for (var i = 0; i < listeners.length; i++) {
			listeners[i](e);
		}
	}

	function onPopstate() {
		var isSilent = silent;
		silent = false;
		if (isSilent) return;
		emit({ mode: 'pop', silent: false });
	}

	var popAttached = false;
	if (typeof globalThis.addEventListener === 'function') {
		globalThis.addEventListener('popstate', onPopstate);
		popAttached = true;
	}

	return {
		location: function() {
			return snapshot();
		},

		on: function(fn) {
			if (typeof fn !== 'function') return function() {};
			listeners.push(fn);

			return function() {
				var idx = listeners.indexOf(fn);
				if (idx >= 0) listeners.splice(idx, 1);
			};
		},
		
		off: function(fn) {
			var idx = listeners.indexOf(fn);
			if (idx >= 0) listeners.splice(idx, 1);
		},

		push: function(route, state = {}, opts = {}) {
			opts.mode = opts.mode || 'push';
			var url = buildUrl(conf, route);
			history[opts.mode + 'State'](state, '', url);
			if (!opts.silent) emit(opts);
		},

		replace: function(route, state = {}, opts = {}) {
			opts.mode = 'replace';
			this.push(route, state, opts);
		},

		back: function(opts = {}) {
			silent = !!opts.silent;
			history.back();
		},

		forward: function(opts = {}) {
			silent = !!opts.silent;
			history.forward();
		},
		
			go: function(n, opts = {}) {
				silent = !!opts.silent;
				history.go(n);
			},

			destroy: function() {
				listeners = [];
				if (popAttached && typeof globalThis.removeEventListener === 'function') {
					globalThis.removeEventListener('popstate', onPopstate);
					popAttached = false;
				}
			}
		};
}
