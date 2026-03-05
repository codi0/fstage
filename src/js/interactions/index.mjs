// @fstage/interactions
//
// Parses a component's static interactions declaration and wires up:
//   - DOM events     'click(.selector)'        → delegated listener
//   - Gestures       'gesture.swipe(.sel)'     → gestureManager
//
// Usage in config.js afterLoadLibs:
//
//   const interactionsManager = e.get('interactions.createInteractionsManager', [{
//       animator,
//       gestureManager,
//   }]);
//
// Usage in components:
//
//   static interactions = {
//       'click(.btn)':             		(e, ctx) => { ... },
//       'change(input)':           		(e, ctx) => { ... },
//       'gesture.swipe(.row)':     		{ directions: ['left','right'], onCommit(e, ctx) { ... } },
//       'gesture.longPress':       		{ onStart(e, ctx) { ... } },
//   };


// Bind all function-valued properties to the component instance
function bindCallbacks(obj, component) {
	var bound = {};
	for (var key in obj) {
		var val = obj[key];
		bound[key] = (typeof val === 'function')
			? (function(fn) { return function() { return fn.apply(component, arguments); }; })(val)
			: val;
	}
	return bound;
}

// Parse a static interactions key into its parts:
//   'click(.btn)'            				→ { group: 'dom',       name: 'click',    selector: '.btn' }
//   'gesture.swipe(.row)'    				→ { group: 'gesture',   name: 'swipe',    selector: '.row' }
//   'gesture.swipe'          				→ { group: 'gesture',   name: 'swipe',    selector: null   }
function parseKey(key) {
	// 	Namespaced groups
	var dotMatch = key.match(/^(\w+)\.(\w+)(?:\((.+)\))?$/);
	if (dotMatch) {
		return {
			group:    dotMatch[1],
			name:     dotMatch[2],
			selector: dotMatch[3] || null,
		};
	}
	// DOM event
	var evtMatch = key.match(/^([\w:-]+)(?:\((.+)\))?$/);
	if (evtMatch) {
		return {
			group:    'dom',
			name:     evtMatch[1],
			selector: evtMatch[2] || null,
		};
	}
	return null;
}


// ── DOM event delegation (supports shadow composedPath) ──────────────────────

function activateDomEvent(root, isShadow, eventName, selector, handler) {
	var listener = function(e) {
		var matched = null;
		if (selector) {
			if (isShadow) {
				var path = e.composedPath();
				for (var i = 0; i < path.length; i++) {
					if (path[i] === root) break;
					if (path[i].matches && path[i].matches(selector)) { matched = path[i]; break; }
				}
			} else {
				matched = (e.target && e.target.closest) ? e.target.closest(selector) : null;
				if (matched && !root.contains(matched)) matched = null;
			}
			if (!matched) return;
		} else {
			matched = e.target;
		}
		Object.defineProperty(e, 'matched', { value: matched, configurable: true, enumerable: false });
		handler(e);
	};
	root.addEventListener(eventName, listener);
	return function() { root.removeEventListener(eventName, listener); };
}


export function createInteractionsManager(config) {
	config = config || {};

	var animator       = config.animator;
	var gestureManager = config.gestureManager;

	return {
		// Definition-based components (Fstage component runtime).
		// Returns a single cleanup function.
		activate: function(interactions, ctx) {
			if (!interactions) return null;

			var cleanups   = [];
			var exitConfig = null;
			var isShadow   = !!ctx.host.shadowRoot;

			for (var key in interactions) {
				var parsed = parseKey(key);
				if (!parsed) continue;
				var value = interactions[key];

				// ── Gesture ─────────────────────────────────────────────
				if (parsed.group === 'gesture') {
					var target = parsed.selector ? ctx.root.querySelector(parsed.selector) : ctx.root;
					if (!target) continue;

					var cfg = { target: target };
					if (value && value.directions) cfg.directions = value.directions;
					if (value && value.trigger) {
						cfg.trigger = ctx.root.querySelector(value.trigger) || undefined;
					}

					var cbNames = ['onStart', 'onProgress', 'onCommit', 'onCancel'];
					for (var i = 0; i < cbNames.length; i++) {
						var cb = cbNames[i];
						if (value && typeof value[cb] === 'function') {
							(function(fn, cbName) {
								cfg[cbName] = function(e) { fn(e, ctx); };
							})(value[cb], cb);
						}
					}

					var off = gestureManager.on(parsed.name, cfg);
					if (typeof off === 'function') cleanups.push(off);
					continue;
				}

				// ── Docment/Window DOM event ───────────────────────────────────
				if (parsed.group === 'document' || parsed.group === 'window' || parsed.group === 'globalThis') {
					(function(anchor, fn) {
						var handler = function(e) { fn(e, ctx); };
						anchor.addEventListener(parsed.name, handler);
						cleanups.push(function() { anchor.removeEventListener(parsed.name, handler); });
					})(parsed.group === 'document' ? document : globalThis, value);
				}

				// ── DOM event ───────────────────────────────────────────
				if (parsed.group === 'dom') {
					(function(fn) {
						cleanups.push(activateDomEvent(ctx.root, isShadow, parsed.name, parsed.selector, function(e) {
							fn(e, ctx);
						}));
					})(value);
				}
			}

			return function() {
				if (exitConfig && animator) {
					animator.animate(ctx.host, exitConfig.preset || exitConfig, exitConfig);
				}
				for (var i = cleanups.length - 1; i >= 0; i--) {
					try { cleanups[i](); } catch (err) {}
				}
			};
		},

	};
}