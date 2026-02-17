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
		url = basePath + ((path === defHome) ? '' : path);
	}

	return cleanDoubleSlashes(url);
}

export function createBrowserHistory(options) {
	options = options || {};

	var conf = {
		urlScheme: options.urlScheme || 'hash',
		basePath: normalizePath(options.basePath || '/'),
		defHome: normalizeRoute(options.defHome || '/')
	};

	var listeners = [];

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
		emit({ mode: 'pop' });
	}

	globalThis.addEventListener('popstate', onPopstate);

	return {
		location: function() {
			return snapshot();
		},

		on: function(fn) {
			if (typeof fn !== 'function') return function() {};
			listeners.push(fn);

			return function() {
				this.off(fn);
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

		back: function() { history.back(); },
		forward: function() { history.forward(); },
		go: function(n) { history.go(n); }
	};
}