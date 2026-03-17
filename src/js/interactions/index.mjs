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