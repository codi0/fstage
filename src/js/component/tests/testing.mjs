/**
 * @fstage/component/tests/testing
 *
 * Lightweight component test harness. Mounts component definitions against a
 * real store and registry without requiring LitElement, a build step, or a
 * full application bootstrap.
 *
 * The harness simulates LitElement's update lifecycle via a minimal mock base
 * class: connectedCallback → requestUpdate → (microtask) → performUpdate →
 * willUpdate + updated. No actual DOM rendering occurs — component logic
 * (state, watches, interactions, lifecycle hooks) is exercised directly.
 *
 * For tests that need DOM elements (e.g. bind, form, interaction delegation),
 * authors can write HTML into harness.root before triggering events.
 *
 * Usage:
 * ```js
 * import { createTestRuntime } from './testing.mjs';
 *
 * const rt = createTestRuntime({ services: { models: mockModels } });
 *
 * const h = await rt.mount({
 *   tag:   'my-counter',
 *   state: { count: 0 },
 *   interactions: {
 *     'click(.inc)': (e, { state }) => state.$set('count', state.count + 1),
 *   },
 * });
 *
 * h.root.innerHTML = '<button class="inc">+</button>';
 * h.trigger('.inc', 'click');
 * assertEqual(h.state.count, 1);
 *
 * h.disconnect();
 * rt.destroy();
 * ```
 */

import { createStore }    from '../../store/index.mjs';
import { createRegistry } from '../../registry/index.mjs';
import { createRuntime }  from '../index.mjs';


// =============================================================================
// Helpers
// =============================================================================

/** Drain the microtask queue once. */
function flush() {
	return new Promise(function(resolve) { queueMicrotask(resolve); });
}

/** Drain the microtask queue twice — for operations that chain Promises internally. */
function flush2() {
	return flush().then(flush);
}

/** Auto-incrementing counter for unique element tag names. */
var _tagCounter = 0;


// =============================================================================
// Mock interactions manager
// =============================================================================

/**
 * Minimal interactions manager for test environments.
 *
 * Parses `'eventType(selector)'` interaction keys and wires delegated DOM
 * listeners on `ctx.root`, `document`, or `window`. Supports `keys`, `prevent`,
 * `stop`, and `once` descriptor options. Returns a cleanup function.
 *
 * @returns {{ activate(interactions, ctx): Function, dispatch(host, type, detail, opts): Event }}
 */
function createMockInteractionsManager() {
	return {

		activate: function(interactions, ctx) {
			var root      = ctx.root;
			var listeners = [];

			for (var key in interactions) {
				var desc = interactions[key];
				if (!desc || typeof desc.handler !== 'function') continue;

				var m = key.match(/^(\w+)\((.+)\)$/);
				if (!m) continue;

				(function(evType, sel, d) {
					var isDoc = (sel === 'document');
					var isWin = (sel === 'window');
					var target = isDoc ? document : isWin ? window : root;

					function handler(e) {
						var matched = null;
						if (!isDoc && !isWin) {
							if (!e.target || typeof e.target.closest !== 'function') return;
							matched = e.target.closest(sel);
							if (!matched) return;
						}
						if (d.keys && !d.keys.includes(e.key)) return;
						if (d.prevent) e.preventDefault();
						if (d.stop)    e.stopPropagation();
						e.matched = matched;
						try { d.handler(e, ctx); } catch (err) {}
						if (d.once) target.removeEventListener(evType, handler);
					}

					target.addEventListener(evType, handler);
					listeners.push({ target: target, type: evType, handler: handler });
				})(m[1], m[2], desc);
			}

			return function() {
				for (var i = 0; i < listeners.length; i++) {
					listeners[i].target.removeEventListener(listeners[i].type, listeners[i].handler);
				}
			};
		},

		dispatch: function(host, type, detail, opts) {
			var e = new CustomEvent(type, Object.assign({ detail: detail, bubbles: true, composed: true }, opts || {}));
			host.dispatchEvent(e);
			return e;
		}

	};
}


// =============================================================================
// Mock base class
// =============================================================================

/**
 * Create a minimal HTMLElement base class that simulates LitElement's update
 * lifecycle without requiring the lit-element package.
 *
 * Lifecycle simulated:
 *   connectedCallback()    → requestUpdate()
 *   requestUpdate()        → schedules performUpdate() via queueMicrotask
 *   performUpdate()        → willUpdate(new Map()) → updated(new Map())
 *   disconnectedCallback() → (no-op; component runtime handles cleanup)
 *
 * Each call to createMockBaseClass() returns a fresh class. This is important
 * because each createRuntime() call passes a distinct baseClass, so multiple
 * test runtimes in the same page do not share a prototype.
 *
 * @returns {typeof HTMLElement}
 */
function createMockBaseClass() {
	return class MockBase extends HTMLElement {

		constructor() {
			super();
			/** True when an update microtask has been queued. */
			this.isUpdatePending    = false;
			this.__updateScheduled  = false;
		}

		connectedCallback() {
			this.requestUpdate();
		}

		disconnectedCallback() {}

		/**
		 * Returns a shadow root. The component runtime calls this only when
		 * `def.shadow` is true; for `shadow: false` it sets `ctx.root = this`.
		 */
		createRenderRoot() {
			return this.attachShadow({ mode: 'open' });
		}

		/**
		 * Schedule a deferred update via queueMicrotask. Idempotent — multiple
		 * calls before the microtask fires result in a single update.
		 */
		requestUpdate() {
			if (this.__updateScheduled) return;
			this.__updateScheduled = true;
			this.isUpdatePending   = true;
			queueMicrotask(() => {
				this.__updateScheduled = false;
				if (this.isConnected) this.performUpdate();
			});
		}

		/**
		 * Execute one update cycle: createRenderRoot (first time) → willUpdate →
		 * render → updated. The component runtime overrides this to wrap it in
		 * store.$track, which requires render() to be called here so that state
		 * reads inside render functions are captured as reactive dependencies.
		 */
		performUpdate() {
			this.isUpdatePending = false;
			// Ensure ctx.root is set before the first update cycle, mirroring
			// LitElement's lazy createRenderRoot() call during performUpdate.
			if (!this.__rootCreated) {
				this.__rootCreated = true;
				this.createRenderRoot();
			}
			this.willUpdate(new Map());
			// Call render() so that $track captures state dependencies. The result
			// is discarded in the test environment — there is no real DOM to patch.
			this.render();
			this.updated(new Map());
		}

		/** Called before each update. Overridden by the component runtime. */
		willUpdate(changed) {}

		/** Called after each update. Overridden by the component runtime. */
		updated(changed) {}

		/** Returns null — no real rendering in test context. */
		render() { return null; }

	};
}


// =============================================================================
// createTestRuntime
// =============================================================================

/**
 * Create a component test runtime.
 *
 * Creates a shared store, registry, and mock interactions manager, then
 * initialises a `createRuntime` instance backed by a mock LitElement base class.
 * Each call to `mount` registers a fresh component with a unique generated tag
 * and returns a connected, rendered harness.
 *
 * @param {Object} [opts]
 * @param {Object}   [opts.store]       - Shared reactive store. A fresh store is created if omitted.
 * @param {Object}   [opts.registry]    - Service registry. A fresh registry is created if omitted.
 * @param {Object}   [opts.config]      - App config exposed as `ctx.config`.
 * @param {Object}   [opts.services]    - Map of `{ serviceName: value }` registered on the registry.
 * @param {Object}   [opts.formManager] - Form manager for testing `form` / `forms` blocks.
 *
 * @returns {{
 *   mount(def: Object, mountOpts?: Object): Promise<Harness>,
 *   store: Object,
 *   registry: Object,
 *   destroy(): void,
 * }}
 */
export function createTestRuntime(opts) {
	opts = opts || {};

	var store    = opts.store    || createStore();
	var registry = opts.registry || createRegistry();

	if (opts.services) {
		for (var svcName in opts.services) registry.set(svcName, opts.services[svcName]);
	}

	// Minimal tagged-template no-op so components that call ctx.html`` when
	// def.render is absent do not throw (the result is discarded anyway).
	function mockHtml(strings) {
		var out = strings[0] || '';
		for (var i = 1; i < arguments.length; i++) out += (arguments[i] != null ? arguments[i] : '') + (strings[i] || '');
		return out;
	}

	var runtime = createRuntime({
		store:               store,
		registry:            registry,
		config:              opts.config      || {},
		baseClass:           createMockBaseClass(),
		interactionsManager: createMockInteractionsManager(),
		formManager:         opts.formManager || null,
		onError:             opts.onError     || null,
		ctx:                 { html: mockHtml, css: mockHtml, svg: mockHtml },
	});

	// Hidden container — host elements are appended here so isConnected is true.
	var container = document.createElement('div');
	container.style.cssText = 'position:absolute;top:-9999px;visibility:hidden;pointer-events:none';
	document.body.appendChild(container);

	return {

		/**
		 * Mount a component definition. Registers the component with a unique
		 * generated tag, creates and connects a host element, waits for the
		 * initial render to settle, and returns the harness.
		 *
		 * @param {Object} def           - Component definition (tag is replaced with a unique generated one).
		 * @param {Object} [mountOpts]
		 * @param {Object}   [mountOpts.props] - Initial prop values set before connect.
		 * @returns {Promise<Harness>}
		 */
		mount: function(def, mountOpts) {
			mountOpts = mountOpts || {};

			// Clone and assign a unique tag so each mount is an independent registration.
			var clonedDef = Object.assign({}, def);
			clonedDef.tag = 'test-component-' + (++_tagCounter);

			runtime.define(clonedDef);

			var host = document.createElement(clonedDef.tag);

			// Apply initial props before connection so willUpdate sees them.
			if (mountOpts.props) {
				for (var pk in mountOpts.props) host[pk] = mountOpts.props[pk];
			}

			// Track render count via an own-property wrapper on performUpdate.
			var renderCount = 0;
			var _pu = host.performUpdate.bind(host);
			Object.defineProperty(host, 'performUpdate', {
				value: function() { renderCount++; _pu(); },
				writable: true, configurable: true,
			});

			container.appendChild(host);

			// Wait for the initial render microtask to settle.
			return flush().then(function() {
				var ctx  = host.__ctx;
				var root = ctx.root;

				/**
				 * @typedef {Object} Harness
				 * @property {Object}   ctx         - Frozen component ctx.
				 * @property {Element}  host        - Host element.
				 * @property {Element}  root        - Render root (shadow root or host for shadow:false).
				 * @property {Object}   state       - Alias for ctx.state.
				 * @property {Object}   store       - The shared store.
				 * @property {number}   renderCount - Number of update cycles completed.
				 * @property {Function} flush       - Drain microtask queue once.
				 * @property {Function} flush2      - Drain microtask queue twice.
				 * @property {Function} setProps    - Set prop values and flush.
				 * @property {Function} trigger     - Dispatch a DOM event and return it.
				 * @property {Function} find        - querySelector on root.
				 * @property {Function} findAll     - querySelectorAll on root as Array.
				 * @property {Function} disconnect  - Disconnect and remove host element.
				 */
				var harness = {
					ctx:   ctx,
					host:  host,
					root:  root,
					store: store,

					get state()       { return ctx.state; },
					get renderCount() { return renderCount; },

					flush:  flush,
					flush2: flush2,

					/**
					 * Write prop values directly to the store (simulates LitElement's
					 * property observation + willUpdate mirroring) and flush.
					 *
					 * @param {Object} props - Partial map of propName → value.
					 * @returns {Promise<void>}
					 */
					setProps: function(props) {
						for (var k in props) {
							host[k] = props[k];
							// Mirror directly into the store — equivalent to willUpdate behaviour.
							if (clonedDef.state[k] && clonedDef.state[k].$src === 'prop') {
								ctx.state.$set(k, props[k]);
							}
						}
						return flush();
					},

					/**
					 * Dispatch a DOM event from within the render root. If `selector` is
					 * provided, the event is dispatched from the matching element (or root
					 * if none found). Returns the dispatched event.
					 *
					 * @param {string|null} selector  - CSS selector, or null for the root itself.
					 * @param {string}      type      - Event type (e.g. 'click', 'input').
					 * @param {Object}      [init]    - EventInit properties merged with defaults.
					 * @returns {Event}
					 */
					trigger: function(selector, type, init) {
						var target = selector ? (root.querySelector(selector) || root) : root;
						var opts   = Object.assign({ bubbles: true, composed: true }, init || {});
						// Use KeyboardEvent when init contains a key property so e.key is populated.
						var Ctor   = (init && init.key !== undefined) ? KeyboardEvent : Event;
						var e      = new Ctor(type, opts);
						target.dispatchEvent(e);
						return e;
					},

					/**
					 * querySelector on the render root.
					 *
					 * @param {string} selector
					 * @returns {Element|null}
					 */
					find: function(selector) {
						return root ? root.querySelector(selector) : null;
					},

					/**
					 * querySelectorAll on the render root, returned as a plain Array.
					 *
					 * @param {string} selector
					 * @returns {Element[]}
					 */
					findAll: function(selector) {
						return root ? Array.from(root.querySelectorAll(selector)) : [];
					},

					/**
					 * Disconnect the component and remove it from the document.
					 * Cleanup functions registered via ctx.cleanup run automatically
					 * via disconnectedCallback.
					 */
					disconnect: function() {
						if (host.parentNode) host.parentNode.removeChild(host);
					},
				};

				return harness;
			});
		},

		/** The shared store instance. */
		store: store,

		/** The shared registry instance. */
		registry: registry,

		/**
		 * Remove the hidden container from the document. Call once after all
		 * test mounts in a suite have been disconnected.
		 */
		destroy: function() {
			if (container.parentNode) container.parentNode.removeChild(container);
		},

	};
}
