// @fstage/interactions
//
// Parses a component's static interactions declaration and wires up:
//   - DOM events      'click(.selector)'      delegated to host/root
//   - Global events   'addTask(document)'     listener on document/window
//   - Extended groups 'gesture.swipe(.sel)'   via extend()
//
// Core handles native DOM events. All prefixed groups must be registered
// via extend(). Handler signature:
//
//   handler(action, selector, value, ctx) -> off function | void
//
// If the handler returns a function it is automatically added to cleanups.


// Resolves a normalised interaction descriptor (or plain function) to a ready-to-call
// handler, applying debounce/throttle/keys/prevent/stop modifiers as needed.
function resolveHandler(value) {
	var fn, debounce, throttle, prevent, stop, once, keys;

	if (typeof value === 'function') {
		fn = value;
		debounce = throttle = prevent = stop = once = 0;
		keys = null;
	} else if (value && typeof value.handler === 'function') {
		fn       = value.handler;
		debounce = value.debounce || 0;
		throttle = value.throttle || 0;
		prevent  = value.prevent;
		stop     = value.stop;
		once     = value.once;
		keys     = value.keys || null;
	} else {
		return null;
	}

	var wrapped = fn;
	if (debounce) {
		var debTimer;
		wrapped = function(e, c) { clearTimeout(debTimer); debTimer = setTimeout(function() { fn(e, c); }, debounce); };
	} else if (throttle) {
		var throttleLast = 0;
		wrapped = function(e, c) { var now = Date.now(); if (now - throttleLast >= throttle) { throttleLast = now; fn(e, c); } };
	}

	return function(e, ctx) {
		if (keys && keys.length && keys.indexOf(e.key) === -1) return;
		if (prevent) e.preventDefault();
		if (stop)    e.stopPropagation();
		wrapped(e, ctx);
	};
}

// Selector is a CSS string, an EventTarget (global), or null.
function parseKey(key) {
	var dotMatch = key.match(/^(\w+)\.(\w+)(?:\((.+)\))?$/);
	if (dotMatch) {
		return {
			group:    dotMatch[1],
			name:     dotMatch[2],
			selector: dotMatch[3] || null,
		};
	}
	var evtMatch = key.match(/^([\w:-]+)(?:\((.+)\))?$/);
	if (evtMatch) {
		var raw = evtMatch[2] || null;
		var globals = { document: document, window: globalThis, globalThis: globalThis };
		return {
			group:    null,
			name:     evtMatch[1],
			selector: (raw && globals[raw]) ? globals[raw] : raw,
		};
	}
	return null;
}

// Non-bubbling events that have bubbling equivalents when used with a selector.
// enter/leave variants need a relatedTarget containment check to preserve semantics.
var NON_BUBBLING_MAP = {
	blur:          { event: 'focusout',     check: null },
	focus:         { event: 'focusin',      check: null },
	mouseenter:    { event: 'mouseover',    check: 'enter' },
	mouseleave:    { event: 'mouseout',     check: 'leave' },
	pointerenter:  { event: 'pointerover',  check: 'enter' },
	pointerleave:  { event: 'pointerout',   check: 'leave' },
};

// DOM event delegation (supports shadow composedPath).
// Calls handler(e) only when e.target matches selector (or always if no selector).
// Non-bubbling events with a selector are automatically remapped to their bubbling equivalents.
function activateDomEvent(root, isShadow, eventName, selector, handler) {
	// Remap non-bubbling events to bubbling equivalents when used with a selector.
	var enterLeaveCheck = null;
	if (selector) {
		var remap = NON_BUBBLING_MAP[eventName];
		if (remap) {
			eventName = remap.event;
			enterLeaveCheck = remap.check;
		}
	}

	var listener = function(e) {
		if (selector) {
			var matched = null;
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
			// For enter/leave remaps: only fire when pointer/focus moves in from outside
			// (mouseover/mouseout also fire on children, so check relatedTarget).
			if (enterLeaveCheck) {
				var related = e.relatedTarget;
				if (enterLeaveCheck === 'enter' && related && matched.contains(related)) return;
				if (enterLeaveCheck === 'leave' && related && matched.contains(related)) return;
			}
			Object.defineProperty(e, 'matched', { value: matched, configurable: true, enumerable: false });
		}
		handler(e);
	};
	root.addEventListener(eventName, listener);
	return function() { root.removeEventListener(eventName, listener); };
}

// Interactions Manager export
// ---------------------------------------------------------------------------
// ComponentCtx typedef
// ---------------------------------------------------------------------------

/**
 * Per-instance component context object. Passed as the second argument to all
 * lifecycle hooks (`connected`, `disconnected`, `rendered`, `constructed`) and
 * as the second argument to all interaction handlers.
 *
 * `ctx` is frozen after `createRenderRoot()` — no new properties may be added
 * after setup. Use `ctx._` for imperative per-instance state.
 *
 * @typedef {Object} ComponentCtx
 * @property {Object}   state    - Reactive state proxy. Read any declared state key;
 *   write via `state.$set(key, val)`, `state.$merge(key, val)`, `state.$del(key)`.
 *   Getters declared in the `state` block are accessible here too.
 * @property {Element}  host     - The custom element host node.
 * @property {Element|ShadowRoot} root - Render root (shadow root, or host when `shadow: false`).
 * @property {Object}   config   - App config object (from `createRuntime` config).
 * @property {Object}   _        - Private mutable bag for imperative per-instance state.
 *   Declare all instance-local fields in `constructed({ _ })` for clarity.
 * @property {Function} cleanup  - `cleanup(fn)` — register a teardown function that
 *   runs when the component disconnects.
 * @property {Function} emit     - `emit(type, detail?, opts?)` — dispatch a CustomEvent
 *   from the host element (`bubbles: true, composed: true` by default).
 * @property {Function} [animate] - `animate(el, preset, opts?)` — run a named WAAPI
 *   preset on `el`. Present only when `config.animator` is wired.
 * @property {Function} html     - lit-html `html` tag for templates.
 * @property {Function} css      - lit `css` tag for styles.
 * @property {Function} svg      - lit-html `svg` tag.
 * @property {Function} [repeat] - lit-html `repeat` directive.
 * @property {Object}   [form]   - Form controller for single-form components
 *   (shorthand; equivalent to `ctx.forms.form`). Present when `form:` is declared.
 * @property {Object}   [forms]  - Map of `name → FormController` for all declared forms.
 *   Present when `forms:` is declared.
 */

/**
 * Create an interactions manager that wires a component's declarative
 * `interactions` block to DOM events and registered extension groups.
 *
 * **Key formats:**
 * - `'click(.selector)'` — delegated DOM event on `ctx.root`
 * - `'click(document)'` / `'click(window)'` — global listener
 * - `'gesture.swipe(.row)'` — prefixed extension group (requires `extend()`)
 *
 * @returns {{
 *   extend(group: string, handler: Function): void,
 *   dispatch(host: Element, type: string, detail?: *, opts?: Object): boolean,
 *   activate(interactions: Object, ctx: Object): Function
 * }}
 *
 * **`extend(group, handler)`** — register a handler for a prefixed interaction
 * group. `handler(action, selector, value, ctx)` should return an `off`
 * function or void.
 *
 * **`dispatch(host, type, detail?, opts?)`** — dispatch a `CustomEvent` from
 * the host element (`bubbles: true, composed: true` by default).
 *
 * **`activate(interactions, ctx)`** — wire all entries in the interactions map
 * for a component instance. Returns a single cleanup function that removes all
 * listeners when called.
 */
export function createInteractionsManager() {
	const extensions = {};

	return {

		// Register a handler for a prefixed interaction group.
		// handler(action, selector, value, ctx) -> off fn | void
		extend: function(group, handler) {
			extensions[group] = handler;
		},

		// Dispatch a CustomEvent from a host element.
		dispatch: function(host, type, detail, opts) {
			var event = new CustomEvent(type, Object.assign({ bubbles: true, composed: true, detail: detail || null }, opts || {}));
			return host.dispatchEvent(event);
		},

		// Wire up a component's interactions declaration.
		// Returns a single cleanup function.
		activate: function(interactions, ctx) {
			if (!interactions) return null;

			var cleanups = [];
			var isShadow = !!ctx.host.shadowRoot;

			for (var key in interactions) {
				var parsed = parseKey(key);
				if (!parsed) continue;
				var value = interactions[key];

				// Extended group
				if (parsed.group && extensions[parsed.group]) {
					var off = extensions[parsed.group](parsed.name, parsed.selector, value, ctx);
					if (typeof off === 'function') cleanups.push(off);
					continue;
				}

				// Global target — 'click(document)', 'addTask(document)', 'resize(window)' etc.
				if (parsed.selector && typeof parsed.selector === 'object') {
					(function(handler) {
						if (!handler) return;
						var listener = function(e) { handler(e, ctx); };
						parsed.selector.addEventListener(parsed.name, listener);
						cleanups.push(function() { parsed.selector.removeEventListener(parsed.name, listener); });
					})(resolveHandler(value));
					continue;
				}

				// Native DOM event on host/root
				if (!parsed.group) {
					(function(handler) {
						if (!handler) return;
						cleanups.push(activateDomEvent(ctx.root, isShadow, parsed.name, parsed.selector, function(e) {
							handler(e, ctx);
						}));
					})(resolveHandler(value));
					continue;
				}

				// Unrecognised group — warn
				console.warn('[interactions] No extension registered for group: ' + parsed.group);
			}

			return function() {
				for (var i = cleanups.length - 1; i >= 0; i--) {
					try { cleanups[i](); } catch (err) {}
				}
			};
		},

	};
}