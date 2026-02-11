// @fstage/route
//
// Responsibilities:
// - Deterministic path matching
// - Param extraction
// - Nested-ready structure
//
// Child route paths are treated as relative to parent.
// All paths are normalized internally.

function normalize(path) {
	path = path || '/';

	if (path[0] !== '/') path = '/' + path;

	if (path.length > 1 && path[path.length - 1] === '/') {
		path = path.slice(0, -1);
	}

	return path;
}

function split(path) {
	var p = normalize(path);

	// Explicit root handling
	if (p === '/') return [];

	return p.split('/').slice(1);
}

function join(parent, child) {
	parent = parent || '';
	child = child || '';

	// Child paths are treated as relative
	if (child[0] === '/') {
		child = child.slice(1);
	}

	return normalize(parent + '/' + child);
}

function computeScore(pattern) {
	var parts = split(pattern);
	var score = 0;

	for (var i = 0; i < parts.length; i++) {
		if (parts[i][0] === ':') {
			score += 1;    // param
		} else {
			score += 10;   // static
		}
	}

	// Longer patterns rank higher
	return score + (parts.length * 100);
}

function match(pattern, path) {
	var patParts = split(pattern);
	var pathParts = split(path);

	if (patParts.length !== pathParts.length) return null;

	var params = {};

	for (var i = 0; i < patParts.length; i++) {
		var p = patParts[i];
		var v = pathParts[i];

		if (p[0] === ':') {
			params[p.slice(1)] = decodeURIComponent(v);
		} else if (p !== v) {
			return null;
		}
	}

	return params;
}

function flatten(routes, parentPath, out) {
	parentPath = parentPath || '';
	out = out || [];

	for (var i = 0; i < routes.length; i++) {
		var r = routes[i];

		var fullPattern = join(parentPath, r.path || '');

		out.push({
			id: r.id || fullPattern,
			pattern: fullPattern,
			meta: r.meta || null
		});

		if (r.children && r.children.length) {
			flatten(r.children, fullPattern, out);
		}
	}

	return out;
}

function resolveEl(el) {
	if (typeof el === 'string') {
		el = document.querySelector(el);
	}
	return el;
}


//EXPORTS

export function createRouteMatcher(options) {
	options = options || {};

	var routes = options.routes || [];
	var flat = flatten(routes);

	// Deterministic precedence
	flat.sort(function(a, b) {
		return computeScore(b.pattern) - computeScore(a.pattern);
	});

	return {
		resolve: function(path) {
			path = normalize(path);

			for (var i = 0; i < flat.length; i++) {
				var route = flat[i];
				var params = match(route.pattern, path);

				if (params) {
					return [{
						id: route.id,
						pattern: route.pattern,
						path: path,
						params: params,
						meta: route.meta
					}];
				}
			}

			return [];
		}
	};
}

export function createNavigationHandler(options) {

	options = options || {};

	var boundForms = [];
	var history = options.history;
	var navigate = options.navigate;
	var rootEl = options.rootEl;
	var linkAttrs = options.linkAttrs || [ 'data-route', 'data-href', 'href' ];
	var replaceAttr = options.replaceAttr || 'data-replace';
	var paramsAttr = options.paramsAttr || 'data-params';

	if (!history) throw new Error('NavigationHandler requires history');
	if (!navigate) throw new Error('NavigationHandler requires navigate()');

	function getRouteFromEl(el) {
		var name = null;
		
		for (var i = 0; i < linkAttrs.length; i++) {
			name = el.getAttribute(linkAttrs[i]);
			if (name) break;
		}
		
		if (!name) return null;

		var mode = el.hasAttribute(replaceAttr) ? 'replace' : 'push';
		var paramsValue = el.getAttribute(paramsAttr);
		var params = {};

		if (paramsValue) {
			var pairs = paramsValue.split(';');
			for (var i = 0; i < pairs.length; i++) {
				var parts = pairs[i].split(':');
				if (parts.length === 2) {
					params[parts[0]] = parts[1];
				}
			}
		}

		return {
			name: name,
			mode: mode,
			params: params
		};
	}

	function bindFormOnce(form, submitter) {

		for (var i = 0; i < boundForms.length; i++) {
			if (boundForms[i].form === form) return;
		}

		function onSubmit(e) {

			e.preventDefault();

			var btn = e.submitter || submitter;
			if (!btn) return;

			var route = getRouteFromEl(btn);
			if (!route) return;

			if (route.name === 'back') {
				history.back();
				return;
			}

			navigate(route.name, {
				replace: route.mode === 'replace',
				params: route.params
			});
		}

		form.addEventListener('submit', onSubmit);

		boundForms.push({
			form: form,
			handler: onSubmit
		});
	}

	function onClick(e) {

		if (e.defaultPrevented) return;
		if (e.button !== 0) return;
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

		var el = null;

		var linkSel = [];
		for (var i=0; i < linkAttrs.length; i++) {
			linkSel.push('[' + linkAttrs[i] + ']');
		}
		linkSel = linkSel.join(', ');

		if (typeof e.composedPath === 'function') {
			var path = e.composedPath();
			for (var i = 0; i < path.length; i++) {
				var candidate = path[i];
				if (!candidate || !candidate.matches) continue;

				if (candidate.matches(linkSel)) {
					el = candidate;
					break;
				}
			}
		} else {
			el = e.target.closest(linkSel);
		}

		if (!el) return;

		var route = getRouteFromEl(el);
		if (!route) return;

		// external absolute URLs
		if (/^(https?:)?\/\//.test(route.name)) return;

		// hash-only
		if (route.name[0] === '#') return;

		e.preventDefault();

		if (route.name === 'back') {
			history.back();
			return;
		}

		// submit button handling
		if (el.type === 'submit') {
			var form = el.form;
			if (form) {
				bindFormOnce(form, el);
				form.requestSubmit(el);
				return;
			}
		}

		navigate(route.name, {
			replace: route.mode === 'replace',
			params: route.params
		});
	}

	function onScroll(e) {

		if (!rootEl) return;
		if (onScroll.__tid) clearTimeout(onScroll.__tid);

		onScroll.__tid = setTimeout(function() {
			var loc = history.location();
			var state = loc.state || {};
			
			if (!loc || !loc.route) return;

			state.scroll = rootEl.scrollTop || 0;

			history.replace(loc.route, state, { silent: true });
		}, 100);
	}

	return {

		start: function(el) {
			rootEl = resolveEl(el || rootEl);
			document.addEventListener('click', onClick);
			if(rootEl) rootEl.addEventListener('scroll', onScroll);
		},

		stop: function() {
			document.removeEventListener('click', onClick);
			if(rootEl) rootEl.removeEventListener('scroll', onScroll);

			for (var i = 0; i < boundForms.length; i++) {
				boundForms[i].form.removeEventListener('submit', boundForms[i].handler);
			}

			boundForms = [];
		}
	};
}

export function createRouter(options) {

	options = options || {};

	var history = options.history;
	var routes = options.routes || [];
	var rootEl = options.rootEl;
	var def404 = options.def404 || null;

	if (!history) throw new Error('Router requires history');

	var beforeHooks = [];
	var afterHooks = [];
	var currentRoute = null;
	var matcher = createRouteMatcher({ routes: routes });

	function runBefore(match, location) {
		for (var i = 0; i < beforeHooks.length; i++) {
			if (beforeHooks[i](match, location) === false) {
				return false;
			}
		}
		return true;
	}

	function runAfter(match, location) {
		for (var i = 0; i < afterHooks.length; i++) {
			afterHooks[i](match, location);
		}
	}

	function commit(path, opts) {
		opts = opts || {};

		if (path === currentRoute) return;

		var matches = matcher.resolve(path);
		if (!matches.length) {
			if (def404 && path !== def404) {
				commit(def404, { replace: true });
			}
			return false;
		}

		if (runBefore(matches[0], history.location()) === false) {
			return false;
		}

		history[opts.replace ? 'replace' : 'push'](path);
		
		return true;
	}

	function onHistory(e) {
		var path = e.location.route;
		if (path === currentRoute) return;

		var matches = matcher.resolve(path);
		if (!matches.length) {
			if (def404 && path !== def404) {
				commit(def404, { replace: true });
			}
			return;
		}
		
		currentRoute = path;
		runAfter(matches[0], e.location);
	}

	var navigation = createNavigationHandler({
		history: history,
		rootEl: rootEl,
		navigate: function(path, opts) {
			commit(path, opts);
		}
	});

	return {

		start: function(el) {
			rootEl = resolveEl(el || rootEl);

			history.on(onHistory);
			navigation.start(rootEl);

			onHistory({ action: 'init', location: history.location() });
		},
		
		stop: function() {
			navigation.stop();
			history.off(onHistory);
		},

		navigate: function(path, opts) {
			commit(path, opts);
		},

		before: function(fn) {
			if (typeof fn === 'function') beforeHooks.push(fn);
		},

		after: function(fn) {
			if (typeof fn === 'function') afterHooks.push(fn);
		}
	};
}