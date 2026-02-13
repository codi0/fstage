// @fstage/router
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
	var last = null;

	// Deterministic precedence
	flat.sort(function(a, b) {
		return computeScore(b.pattern) - computeScore(a.pattern);
	});

	return {
		resolve: function(path) {
			last = [];
			path = normalize(path);

			for (var i = 0; i < flat.length; i++) {
				var route = flat[i];
				var params = match(route.pattern, path);

				if (params) {
					last = [{
						id: route.id,
						pattern: route.pattern,
						path: path,
						params: params,
						meta: route.meta
					}];
					break;
				}
			}

			return last;
		},
		
		last: function() {
			return last;
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

			Promise.resolve(
				navigate(route.name, {
					replace: route.mode === 'replace',
					params: route.params
				})
			);
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
	if (!history) throw new Error('Router requires history');

	var navIndex = 0;
	var lastNavIndex = 0;
	var currentRoute = null;

	var routes = options.routes || [];
	var matcher = createRouteMatcher({ routes: routes });

	var rootEl = options.rootEl;
	var def404 = options.def404 || null;

	var beforeHooks = [];
	var afterHooks = [];

	async function runBefore(match, location) {
		for (var i = 0; i < beforeHooks.length; i++) {
			var res = beforeHooks[i](match, location);

			if (res instanceof Promise) {
				res = await res;
			}

			if (res === false) {
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

	async function commit(path, opts) {
		opts = opts || {};

		if (path === currentRoute) return;

		var matches = matcher.resolve(path);
		if (!matches.length) {
			if (def404 && path !== def404) {
				commit(def404, { replace: true });
			}
			return false;
		}

		if (await runBefore(matches[0], history.location()) === false) {
			return false;
		}

		var method = opts.replace ? 'replace' : 'push';
		var loc = history.location();
		var state = (loc && loc.state) || {};

		if (method === 'push') {
				navIndex++;
		}

		state = Object.assign({}, state, {
				id: navIndex
		});

		history[method](path, state);
		
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
		
		var nextState = e.location.state || {};
		var nextIndex = nextState.id;
		var direction = null;

		if (typeof nextIndex === 'number') {
			if (nextIndex < lastNavIndex) {
				direction = 'back';
			} else if (nextIndex > lastNavIndex) {
				direction = 'forward';
			} else {
				direction = 'replace';
			}
		} else {
			direction = 'unknown';
		}

		lastNavIndex = nextIndex;
		currentRoute = path;

		var loc = Object.assign({}, e.location, {
			direction: direction
		});

		runAfter(matches[0], loc);
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

			var loc = history.location();
			var state = (loc && loc.state) || {};

			if (typeof state.id !== 'number') {
				state.id = 0;
				history.replace(loc.route, state, { silent: true });
			}

			navIndex = state.id;
			lastNavIndex = navIndex;

			onHistory({ action: 'init', location: history.location() });
			
			return this.current();
		},
		
		stop: function() {
			navigation.stop();
			history.off(onHistory);
		},

		current: function() {
			var loc = history.location();
			var matches = matcher.last();
			return Object.assign({}, loc, { match: matches[0] || null });
		},

		match: function(route) {
			var matches = matcher.resolve(route);
			return matches[0] || null;
		},

		navigate: async function(path, opts) {
			await commit(path, opts);
			return this.current();
		},

		forward: function() {
			history.forward();
		},

		back: function() {
			history.back();
		},

		before: function(fn) {
			beforeHooks.push(fn);
		},

		after: function(fn) {
			afterHooks.push(fn);
		}
	};
}