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


// EXPORTS

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

	var boundForms  = [];
	var history     = options.history;
	var navigate    = options.navigate;
	var rootEl      = options.rootEl;
	var linkAttrs   = options.linkAttrs  || [ 'data-route', 'data-href', 'href' ];
	var backAttr    = options.backAttr   || 'data-back';
	var replaceAttr = options.replaceAttr || 'data-replace';
	var paramsAttr  = options.paramsAttr || 'data-params';
	var scrollTid   = null;

	if (!history)  throw new Error('NavigationHandler requires history');
	if (!navigate) throw new Error('NavigationHandler requires navigate()');
	
	if (!linkAttrs.includes(backAttr)) {
		linkAttrs.push(backAttr);
	}

	// Built once at construction time
	var linkSel = linkAttrs.map(function(a) { return '[' + a + ']'; }).join(', ');

	function doNavigate(route) {
		navigate(route.name, {
			back:    route.back,
			replace: route.mode === 'replace',
			params:  route.params
		});
	}

	function getRouteFromEl(el) {
		var name = null;
		var back = el.hasAttribute(backAttr);

		for (var i = 0; i < linkAttrs.length; i++) {
			name = el.getAttribute(linkAttrs[i]);
			if (name) break;
		}
		
		if (!name && back) {
			name = 'back';
		}
		
		if (!name) {
			return null;
		}

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
			back: back,
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

			doNavigate(route);
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

		if (typeof e.composedPath === 'function') {
			var path = e.composedPath();
			for (var i = 0; i < path.length; i++) {
				var candidate = path[i];
				if (!candidate || !candidate.matches) continue;
				if (candidate.matches(linkSel)) { el = candidate; break; }
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

		doNavigate(route);
	}

	function onScroll(e) {

		if (!rootEl) return;
		if (scrollTid) clearTimeout(scrollTid);

		scrollTid = setTimeout(function() {
			scrollTid = null;
			var loc = history.location();
			var state = loc.state || {};

			if (!loc.route) return;
			if (e.target !== rootEl && e.target.parentNode !== rootEl) return;

			state.scroll = e.target.scrollTop || 0;

			history.replace(loc.route, state, { silent: true });
		}, 100);
	}

	return {

		start: function(el) {
			rootEl = resolveEl(el || rootEl);
			document.addEventListener('click', onClick);
			if (rootEl) rootEl.addEventListener('scroll', onScroll, true);
		},

		stop: function() {
			document.removeEventListener('click', onClick);
			if (rootEl) rootEl.removeEventListener('scroll', onScroll, true);

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
	var navStack = [];
	var currentRoute = null;

	var routes = options.routes || [];
	var matcher = createRouteMatcher({ routes: routes });

	var rootEl = options.rootEl;
	var def404 = options.def404 || null;

	var beforeHooks = [];
	var afterHooks  = [];

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

		if (path === currentRoute) {
			return false;
		}

		var method = opts.replace ? 'replace' : 'push';
		var loc    = history.location();
		var state  = loc.state || {};

		var matches = matcher.resolve(path);
		if (!matches.length) {
			if (def404 && path !== def404) {
				commit(def404, { replace: true });
			}
			return false;
		}

		if (await runBefore(matches[0], loc) === false) {
			return false;
		}

		// opts.back: try to honour existing stack position first.
		// If target exists in navStack, jump to it via history.go() to
		// keep the browser stack clean. If not, replace current entry
		// and force back direction so the transition animates correctly.
		if (opts.back) {
			for (var i = navIndex - 1; i >= 0; i--) {
				if (navStack[i] && navStack[i].route === path) {
					history.go(i - navIndex);
					return true;
				}
			}
			method = 'replace';
		}

		// snapshot departing page state before moving on
		if (currentRoute && navStack[navIndex]) {
			navStack[navIndex] = { route: currentRoute, state: state };
		}

		if (method === 'push') {
			navIndex++;
			navStack = navStack.slice(0, navIndex);
		}

		navStack[navIndex] = { route: path, state: {} };

		state = Object.assign({}, state, { id: navIndex });

		// for replace-as-back, force direction into state so onHistory
		// can determine correct transition direction despite unchanged index
		if (opts.back && method === 'replace') {
			state.direction = 'back';
		}

		history[method](path, state, { back: opts.back });

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
			if (nextIndex < navIndex) {
				direction = 'back';
			} else if (nextIndex > navIndex) {
				direction = 'forward';
			} else {
				// same index - use forced direction if present (replace-as-back),
				// otherwise treat as a standard replace
				direction = nextState.direction || 'replace';
			}
			navIndex = nextIndex;
			navStack[navIndex] = { route: path, state: nextState };
		}

		currentRoute = path;

		if (e.silent) return;

		var loc = Object.assign({}, e.location, { direction: direction });

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

			var loc   = history.location();
			var state = loc.state || {};

			if (typeof state.id !== 'number') {
				state.id = 0;
				history.replace(loc.route, state, { silent: true });
			}

			navIndex = state.id;
			navStack[navIndex] = { route: loc.route, state: state };

			onHistory({ mode: 'init', location: history.location() });

			return this.peek(0);
		},

		stop: function() {
			navigation.stop();
			history.off(onHistory);
		},

		match: function(route) {
			var matches = matcher.resolve(route);
			return matches[0] || null;
		},

		navigate: async function(path, opts) {
			await commit(path, opts);
			return this.peek(0);
		},

		peek: function(n) {
			var entry = navStack[navIndex + n];
			if (!entry) return null;
			var matches = matcher.resolve(entry.route);
			if (!matches[0]) return null;
			var state = (n == 0) ? history.location().state : entry.state;
			return { match: matches[0], state: state || {} };
		},

		go: function(n, opts) {
			history.go(n, opts || {});
		},

		onBefore: function(fn) {
			beforeHooks.push(fn);
		},

		onAfter: function(fn) {
			afterHooks.push(fn);
		}
	};
}