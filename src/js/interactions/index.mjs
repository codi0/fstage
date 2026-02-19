// @fstage/interactions
//
// Parses a component's static interactions declaration and wires up:
//   - DOM events     'click(.selector)'       → delegated listener
//   - Gestures       'gesture.swipe(.sel)'    → gestureManager
//   - Animations     'animate.enter'          → animator on activate
//                    'animate.exit'           → animator on deactivate
//
// Usage in config.js afterLoadLibs:
//
//   const interactionsManager = e.get('interactions.createInteractionsManager', [{
//       animator,
//       gestureManager,
//   }]);
//   bindComponentDefaults({ ..., interactionsManager });
//
// Usage in components:
//
//   static interactions = {
//       'click(.btn)':            (e, t) => { this._onBtn(e, t); },
//       'change(input)':          (e, t) => { this._onChange(t.value); },
//       'gesture.swipe(.row)':    { directions: ['left','right'], onCommit(e) { ... } },
//       'gesture.longPress':      { onStart(e) { ... } },
//       'animate.enter':          { preset: 'slideUp', duration: 160 },
//       'animate.exit':           { preset: 'slideDown', duration: 120 },
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
//   'click(.btn)'          → { group: 'dom',     name: 'click',  selector: '.btn' }
//   'gesture.swipe(.row)'  → { group: 'gesture', name: 'swipe',  selector: '.row' }
//   'gesture.swipe'        → { group: 'gesture', name: 'swipe',  selector: null   }
//   'animate.enter'        → { group: 'animate', name: 'enter',  selector: null   }
function parseKey(key) {
	// Dot-namespaced groups: gesture.* or animate.*
	var dotMatch = key.match(/^(gesture|animate)\.(\w+)(?:\((.+)\))?$/);
	if (dotMatch) {
		return {
			group:    dotMatch[1],
			name:     dotMatch[2],
			selector: dotMatch[3] || null,
		};
	}
	// Plain DOM event: 'click' or 'click(.selector)'
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


export function createInteractionsManager(config) {
	config = config || {};

	var animator       = config.animator;
	var gestureManager = config.gestureManager;

	return {

		// Wire all interactions for a component instance.
		// Returns a single cleanup function.
		activate: function(component) {
			var interactions = component.constructor.interactions;
			if (!interactions) return null;

			var cleanups   = [];
			var root       = component.shadowRoot || component;
			var exitConfig = null;

			for (var key in interactions) {
				var parsed = parseKey(key);
				if (!parsed) continue;

				var value = interactions[key];

				// ── Animate ──────────────────────────────────────────────────
				if (parsed.group === 'animate') {
					if (parsed.name === 'enter' && animator) {
						animator.animate(component, value.preset || value, value);
					}
					if (parsed.name === 'exit') {
						exitConfig = value; // deferred — runs on cleanup
					}
					continue;
				}

				// ── Gesture ──────────────────────────────────────────────────
				if (parsed.group === 'gesture' && gestureManager) {
					var gTarget = parsed.selector
						? root.querySelector(parsed.selector)
						: component;

					if (!gTarget && parsed.selector) continue;

					var gOpts = bindCallbacks(
						Object.assign({}, value, { el: gTarget }),
						component
					);

					cleanups.push(gestureManager.on(parsed.name, gOpts));
					continue;
				}

				// ── DOM event ────────────────────────────────────────────────
				if (parsed.group === 'dom') {
					var cb       = value.bind(component);
					var selector = parsed.selector;

					var handler = selector
						? (function(sel, fn) {
							return function(e) {
								var t = e.target && e.target.closest ? e.target.closest(sel) : null;
								if (t) fn(e, t);
							};
						})(selector, cb)
						: function(e) { cb(e, root); };

					root.addEventListener(parsed.name, handler);

					cleanups.push(
						(function(evt, fn) {
							return function() { root.removeEventListener(evt, fn); };
						})(parsed.name, handler)
					);
				}
			}

			// Return unified cleanup — also runs exit animation if declared
			return function() {
				if (exitConfig && animator) {
					animator.animate(component, exitConfig.preset || exitConfig, exitConfig);
				}
				for (var i = 0; i < cleanups.length; i++) {
					try { cleanups[i](); } catch (err) {}
				}
			};
		},

	};
}
