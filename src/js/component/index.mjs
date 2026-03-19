// @fstage/component
//
// Definition-based web component runtime, based on LitElement for maximum compatibility.
// Implements the Fstage Universal Component Definition Standard v1.4.
//
// === Reactive State Provider ===
// The Fstage store is used as the reactive state provider (standard §4.4).
// Each component instance gets two namespaced paths in the store:
//   __cl.{id}.*  — local state    ($src: 'local')
//   __cp.{id}.*  — prop mirror    ($src: 'prop', updated in willUpdate())
//   <decl.key>   — external state ($src: 'external', aliased to decl.key)
//
// ctx.state is a per-instance thin proxy over the global store. Every access
// is automatically wrapped in store.$withScope(component) so path translation
// is always active — no manual $withScope at call sites.
//
// === Capability Claims ===
//   asyncState       — ctx.state.$query
//   animation        — ctx.animate, declarative animate block
//   screenHost       — activated / deactivated hooks
//   hostMethods      — def.host.methods mounted onto the host element
//   interactionExtensions — via config.interactionsManager
//
// === ctx Contract ===
// ctx is frozen after createRenderRoot() — no new properties may be added.
// ctx._ is the designated private instance bag and remains mutable.
// Declare all imperative instance state in constructed({ _ }) for clarity:
//   constructed({ _ }) { _.transitioning = false; _.swipeKey = ''; }
//
// === Declaration Extensions ===
//
//   state — three shorthand forms and one getter form:
//     sheetOpen: false              ->  { $src: 'local', default: false }
//     tasks:     { $ext: 'tasks', default: [] }  ->  { $src: 'external', key: 'tasks', default: [] }
//     open:      { $prop: false }   ->  { $src: 'prop', type: Boolean, default: false }
//     open:      { $prop: Boolean, default: false }  ->  explicit type form
//     get total() { return this.state.items.length; }  ->  reactive derived value,
//       'this' is ctx — this.state.* / this.models / this.config
//
//   bind — declarative two-way bindings between selectors and state keys.
//     bind: {
//       '#task-title':      'newTitle',
//       '.inline-textarea': { key: 'description', event: 'change' },
//       '.rating':          { key: 'rating', extract: (el) => Number(el.dataset.value) },
//     }
//
//   watch — unified reactive subscriptions, wired on connect, torn down on disconnect.
//     All handlers receive (e, ctx) where e = { path, val, oldVal }.
//     Pre-render (default): state coordination, resets, optional immediate call.
//       Handlers fire synchronously during the state mutation, before the async render.
//     Post-render (afterRender: true): DOM operations after each render where value changed.
//     watch: {
//       theme:       (e, ctx) => { ... },                          // pre-render shorthand
//       routeParams: { handler, immediate: true, reset: [...] },   // pre-render descriptor
//       activeRoute: { reset: ['panel'] },                         // pre-render, reset only
//       open:        { handler: fn, afterRender: true },           // post-render
//       task:        { handler: fn, afterRender: true },           // post-render
//     }
//
//   computed — DEPRECATED: use state getters instead. Kept for backwards compatibility.
//     computed: { isEmpty: (ctx) => ctx.state.items.length === 0 }
//
//   interactions — handler may be a plain function or a descriptor:
//     interactions: {
//       'click(.btn)': fn,
//       'input(.search)': { handler: fn, debounce: 300 },
//       'keydown(.field)': { handler: fn, keys: ['Enter'], prevent: true },
//     }
//
//   host — host element configuration:
//     host: {
//       methods: { highlight: function() { ... } },
//       attrs:   { 'data-theme': (ctx) => ctx.state.theme },
//       vars:    { '--row-index': (ctx) => ctx.state.index },
//     }
//
//   animate — declarative animation block (requires animation capability):
//     enter  — host entry, fires once on first render
//     exit   — host exit, fires when skipAttr is set on host
//     toggle(selector) — state-driven animations on child elements:
//     animate: {
//       enter: 'slideUp',
//       exit:  'slideDown',
//       'toggle(.error-msg)': { state: 'hasError', show: 'fadeIn', hide: 'fadeOut' },
//       'toggle(.badge)':     { state: 'count',    show: 'fadeIn', activate: 'pop' },
//     }

import { getType, adoptStyleSheet } from '../utils/index.mjs';


// =============================================================================
// formatDefMap
//
// Normalises and validates all structured definition fields in one pass.
// Mutates def in place; called once at define() time.
// =============================================================================

/**
 * Normalise and validate all structured definition fields in place.
 * Called once at `define()` time — never at runtime.
 *
 * Transforms performed:
 * - Extracts getter properties from `def.state` into `def.stateGetters`.
 * - Expands `$ext`, `$prop`, and bare-value shorthand state declarations to
 *   full `{ $src, key, default, type }` descriptor form.
 * - Normalises `bind` entries to `{ key, event, extract }` descriptor form;
 *   throws if a bind entry conflicts with an interactions entry.
 * - Normalises `watch` entries to pre-render or post-render descriptor form;
 *   throws if `afterRender` is combined with `immediate` or `reset`.
 * - Normalises `interactions` entries to full handler descriptor form.
 * - Normalises the `host` block to `{ methods, attrs, vars }`.
 * - Parses `animate.toggle(selector)` keys into `def.animate.toggle`.
 *
 * @param {Object} def - Component definition object. Mutated in place.
 */
function formatDefMap(def) {

	// state — extract getter properties into def.stateGetters before processing.
	// Getters are reactive derived values; 'this' in the getter is ctx.
	// They are exposed on ctx.state but are not stored in the reactive store.
	const stateGetters = {};
	const stateDescriptors = Object.getOwnPropertyDescriptors(def.state);
	for (const key in stateDescriptors) {
		if (typeof stateDescriptors[key].get === 'function') {
			stateGetters[key] = stateDescriptors[key].get;
			delete def.state[key];
		}
	}
	def.stateGetters = stateGetters;

	// state — normalise shorthand forms:
	//   bare value         -> { $src: 'local', default: val }
	//   { $ext: 'key' }    -> { $src: 'external', key: 'key', default }
	//   { $prop: Type }    -> { $src: 'prop', type: Type, default }
	//   { $prop: default } -> { $src: 'prop', default } (type inferred)
	const allowedSrc = [ 'prop', 'local', 'external' ];
	for (let key in def.state) {
		const s = def.state[key];

		// $ext shorthand
		if (s && typeof s === 'object' && '$ext' in s) {
			def.state[key] = { $src: 'external', key: s.$ext || key, default: s.default };
			def.state[key].key = def.state[key].key || key;
			continue;
		}

		// $prop shorthand
		if (s && typeof s === 'object' && '$prop' in s) {
			const isTypeConstructor = typeof s.$prop === 'function';
			const propDefault = isTypeConstructor ? s.default : s.$prop;
			const propType    = isTypeConstructor ? s.$prop : null;
			def.state[key] = { $src: 'prop', default: propDefault };
			if (propType) def.state[key].type = propType;
			if (!def.state[key].type) {
				const t = getType(propDefault);
				def.state[key].type = t === 'boolean' ? Boolean : t === 'number' ? Number : String;
			}
			continue;
		}

		if (!s || !s.$src) {
			def.state[key] = { $src: 'local', default: s };
			continue;
		}
		if (!allowedSrc.includes(s.$src)) {
			throw new Error('[fstage/component] state.' + key + ' has invalid $src: ' + s.$src);
		}
		s.key = s.key || key;
		if (s.$src === 'prop' && !s.type) {
			const t = getType(s.default);
			s.type = t === 'boolean' ? Boolean : t === 'number' ? Number : String;
		}
	}

	// bind — normalise shorthand; validate no event+selector conflicts with interactions
	const interactionKeys = new Set();
	for (let k in def.interactions) {
		const m = k.match(/^(\w+)\((.+)\)$/);
		if (m) interactionKeys.add(m[1] + '|' + m[2]);
	}
	const bind = {};
	for (let sel in def.bind) {
		const v = def.bind[sel];
		let entry;
		if (typeof v === 'string') {
			entry = { key: v, event: 'input', extract: null };
		} else {
			if (!v || !v.key) throw new Error('[fstage/component] bind["' + sel + '"] must have a key');
			entry = { key: v.key, event: v.event || 'input', extract: v.extract || null };
		}
		if (interactionKeys.has(entry.event + '|' + sel)) {
			throw new Error('[fstage/component] bind["' + sel + '"] conflicts with interactions entry for ' + entry.event + '(' + sel + ')');
		}
		bind[sel] = entry;
	}
	def.bind = bind;

	// watch — normalise all entries to descriptor form.
	// Pre-render (default): { handler, immediate, reset, afterRender: false }
	// Post-render:          { handler, afterRender: true }
	// afterRender must not be combined with immediate or reset.
	for (let key in def.watch) {
		const w = def.watch[key];
		if (typeof w === 'function') {
			def.watch[key] = { handler: w, immediate: false, reset: [], afterRender: false };
		} else {
			const afterRender = !!w.afterRender;
			if (afterRender && (w.immediate || (w.reset && w.reset.length))) {
				throw new Error('[fstage/component] watch.' + key + ': afterRender cannot be combined with immediate or reset');
			}
			def.watch[key] = {
				handler:     typeof w.handler === 'function' ? w.handler : null,
				immediate:   !afterRender && !!w.immediate,
				reset:       !afterRender && Array.isArray(w.reset) ? w.reset : [],
				afterRender: afterRender,
			};
		}
	}

	// interactions — normalise plain function or handler-descriptor.
	// Extension entries (gesture.*, transition.*, etc.) pass through unchanged.
	for (let key in def.interactions) {
		if (/^\w+\./.test(key)) continue;  // extension — skip
		const v = def.interactions[key];
		if (typeof v === 'function') {
			def.interactions[key] = { handler: v, debounce: 0, throttle: 0, prevent: false, stop: false, once: false, keys: null };
		} else if (v && typeof v.handler === 'function') {
			if (v.debounce && v.throttle) {
				throw new Error('[fstage/component] interactions["' + key + '"] cannot have both debounce and throttle');
			}
			def.interactions[key] = {
				handler:  v.handler,
				debounce: v.debounce || 0,
				throttle: v.throttle || 0,
				prevent:  !!v.prevent,
				stop:     !!v.stop,
				once:     !!v.once,
				keys:     Array.isArray(v.keys) ? v.keys : null
			};
		}
	}

	// host — normalise methods/attrs/vars sub-blocks
	const host = def.host || {};
	def.host = {
		methods: host.methods || {},
		attrs:   host.attrs   || {},
		vars:    host.vars    || {},
	};

	// animate — parse toggle(selector) keys; normalise enter/exit presets
	function normalizePreset(v) {
		if (!v) return null;
		return typeof v === 'string'
			? { preset: v, durationFactor: undefined }
			: { preset: v.preset, durationFactor: v.durationFactor };
	}
	const anim     = def.animate || {};
	const toggle   = {};
	const toggleRe = /^toggle\((.+)\)$/;
	for (let key in anim) {
		const m = key.match(toggleRe);
		if (!m) continue;
		const sel = m[1];
		const e   = anim[key];
		if (!e || !e.state) {
			throw new Error('[fstage/component] animate toggle("' + sel + '") must have a state key');
		}
		toggle[sel] = {
			state:          e.state,
			show:           e.show     || null,
			hide:           e.hide     || null,
			activate:       e.activate || null,
			durationFactor: e.durationFactor || undefined
		};
	}
	def.animate = { enter: normalizePreset(anim.enter), exit: normalizePreset(anim.exit), toggle: toggle };
}


// =============================================================================
// wireBind
//
// Attaches delegated listeners on root for each bind entry.
// Returns a cleanup function that removes all listeners.
// =============================================================================

/**
 * Attach delegated input listeners on `ctx.root` for each `bind` entry.
 * Called after the first render commit. Returns a cleanup function.
 *
 * @param {Object} def - Normalised component definition.
 * @param {Object} ctx - Frozen component ctx.
 * @returns {Function|null} Cleanup function, or `null` if no bind entries.
 */
function wireBind(def, ctx) {
	if (!Object.keys(def.bind).length) return null;
	const root      = ctx.root;
	const listeners = [];

	for (var sel in def.bind) {
		(function(selector, entry) {
			function listener(e) {
				if (!e.target || !e.target.matches) return;
				var matched = e.target.closest(selector);
				if (!matched) return;
				var val = entry.extract ? entry.extract(matched) : matched.value;
				ctx.state.$set(entry.key, val);
			}
			root.addEventListener(entry.event, listener);
			listeners.push({ event: entry.event, listener: listener });
		})(sel, def.bind[sel]);
	}

	return function() {
		listeners.forEach(function(l) { root.removeEventListener(l.event, l.listener); });
	};
}


// =============================================================================
// scopePlugin
//
// Installed once on the store per createRuntime call.
//
// path hook — translates declared state keys to real store paths:
//   local    __cl.{id}.key[.sub]
//   prop     __cp.{id}.key[.sub]
//   external decl.key[.sub]
//   unknown  unchanged (global paths pass through)
//
// read hook — supplies declared defaults when the store has no value yet.
// watch hook — auto-registers off() with ctx.cleanup on disconnect.
// =============================================================================

/**
 * Store plugin installed once per `createRuntime` call.
 * Provides per-component path translation, default value injection,
 * and automatic watch cleanup on disconnect.
 *
 * Hooks added:
 * - `path`  — translates declared state keys to namespaced store paths
 *   (`__cl.{id}.*` for local, `__cp.{id}.*` for prop, raw key for external).
 * - `read`  — injects declared defaults when the store has no value yet.
 * - `watch` — auto-registers `off()` with `ctx.cleanup` on disconnect.
 *
 * @returns {{ methods: Object, hooks: Object }} Plugin descriptor.
 */
function scopePlugin() {
	const stack = [];

	return {
		methods: {
			withScope: function(component, fn) {
				let res;
				stack.push(component);
				try { res = fn(); }
				finally { stack.pop(); }
				return res;
			}
		},

		hooks: {
			path: function(e) {
				if (!stack.length) return;
				const component = stack[stack.length - 1];
				const internal  = component.__internal;
				const id        = internal.id;
				const dot  = e.path.indexOf('.');
				const root = dot !== -1 ? e.path.slice(0, dot) : e.path;
				const sub  = dot !== -1 ? e.path.slice(dot)    : '';
				const decl = internal.state[root];
				if (!decl) return;
				if      (decl.$src === 'local')    e.path = '__cl.' + id + '.' + root + sub;
				else if (decl.$src === 'prop')     e.path = '__cp.' + id + '.' + root + sub;
				else if (decl.$src === 'external') e.path = decl.key + sub;
			},

			read: function(e) {
				if (!stack.length) return;
				if (e.val !== undefined) return;
				const component = stack[stack.length - 1];
				const internal  = component.__internal;
				const key       = e.pathOrg;
				const decl      = internal.state[key];
				if (!decl) return;
				if (decl.$src === 'prop') {
					e.val = component[key] !== undefined ? component[key] : decl.default;
				} else if (decl.default !== undefined) {
					e.val = decl.default;
				}
			},

			watch: function(e) {
				if (!stack.length) return;
				const component = stack[stack.length - 1];
				component.__ctx.cleanup(e.off);
			}
		}
	};
}


// =============================================================================
// createStateProxy
//
// Per-component proxy over the global store. Every access is auto-wrapped in
// store.$withScope(component) so path translation is always active.
// State getters are dispatched directly to the getter fn with ctx as 'this'.
// =============================================================================

/**
 * Create a per-component reactive state proxy over the global store.
 * Every property access is auto-wrapped in `store.$withScope(component)`
 * so path translation is always active — no manual `$withScope` at call sites.
 *
 * State getters are intercepted and called with `ctx` as `this`, inside
 * `$withScope` so their reactive reads are tracked correctly.
 *
 * Direct assignment to the proxy throws; use `ctx.state.$set(key, val)`.
 *
 * @param {Object} component   - The LitElement component instance.
 * @param {Object} store       - The global reactive store.
 * @param {Object} stateGetters - Map of getter key → getter function (from `formatDefMap`).
 * @returns {Proxy}
 */
function createStateProxy(component, store, stateGetters) {
	return new Proxy({}, {
		get: function(target, key) {
			if (typeof key === 'symbol') return store[key];
			// State getters — call with ctx as 'this', inside $withScope for reactivity.
			if (stateGetters && stateGetters[key]) {
				try {
					return store.$withScope(component, function() {
						return stateGetters[key].call(component.__ctx);
					});
				} catch (err) {
					const def = component.__internal && component.__internal.def;
					if (def && def.onError) def.onError(err, component.__ctx);
					else console.error('[fstage/component] state getter .' + key + ' error:', err);
					return undefined;
				}
			}
			const val = store[key];
			if (key[0] === '$' && typeof val === 'function') {
				return function() {
					const args = arguments;
					return store.$withScope(component, function() {
						return val.apply(store, args);
					});
				};
			}
			return store.$withScope(component, function() {
				return store.$get(key);
			});
		},
		set: function() {
			throw new Error('[fstage/component] Direct assignment to ctx.state is not allowed — use $set');
		},
		deleteProperty: function() {
			throw new Error('[fstage/component] Direct deletion from ctx.state is not allowed — use $del');
		}
	});
}


// =============================================================================
// createRuntime
// =============================================================================

/**
 * Create a component runtime.
 * Returns a `{ define(def) }` object. Call `define(def)` for each component
 * definition to register it as a custom element.
 *
 * The runtime wires together:
 * - LitElement (or any compatible `baseClass`) as the rendering engine
 * - The fstage store as the reactive state provider
 * - The component definition standard (state, bind, watch, interactions, etc.)
 * - Optional capabilities: animation, screen host, interaction extensions
 *
 * `ctx` is created per-instance and frozen after `createRenderRoot()`. All
 * imperative instance state should live in `ctx._` (declared in `constructed`).
 *
 * @param {Object} config
 * @param {Object}   config.store              - Shared reactive store instance.
 * @param {Function} config.baseClass          - LitElement base class (or compatible).
 * @param {Object}   config.registry           - Service registry for `inject`.
 * @param {Object}   [config.ctx]              - Render helpers to expose on ctx
 *   (e.g. `{ html, css, svg, repeat, classMap }` from lit-html).
 * @param {Object}   [config.config]           - App config object exposed as `ctx.config`.
 * @param {Object}   [config.animator]         - Animator with `.animate()`, `.createToggle()`.
 * @param {Object}   [config.screenHost]       - Screen host for `activated`/`deactivated` hooks.
 * @param {Object}   [config.interactionsManager] - Interactions manager for event wiring.
 * @param {string}   [config.skipAttr='data-leaving'] - Attribute that signals host exit.
 *
 * @returns {{ define(def: Object): void }}
 */
export function createRuntime(config) {
	config = config || {};
	let idCounter = 0;

	const styleCtx   = {};
	const renderCtx  = config.ctx || {};
	const store      = config.store || null;
	const baseClass  = config.baseClass || null;
	const skipAttr   = config.skipAttr  || 'data-leaving';

	[ 'css', 'unsafeCSS' ].forEach(function(key) {
		if (renderCtx[key]) styleCtx[key] = renderCtx[key];
	});

	store.$extend(scopePlugin);

	return {

		define: function(def) {

			const defaults = {
				shadow:       true,
				state:        {},
				bind:         {},
				watch:        {},
				computed:     {},
				animate:      {},
				inject:       {},
				interactions: {},
				host:         {}
			};
			for (var i in defaults) {
				if (def[i] === undefined) def[i] = defaults[i];
			}

			formatDefMap(def);

			if (!baseClass) throw new Error('[fstage/component] baseClass required');
			if (!def.tag || def.tag.indexOf('-') === -1) throw new Error('[fstage/component] Invalid tag: ' + def.tag);
			if (customElements.get(def.tag)) throw new Error('[fstage/component] Already defined: ' + def.tag);

			class Component extends baseClass {

				static get properties() {
					const props = {};
					for (var i in def.state) {
						if (def.state[i].$src === 'prop') props[i] = def.state[i];
					}
					return props;
				}

				static get styles() {
					if (!def.style) return;
					const res = typeof def.style === 'function' ? def.style(styleCtx) : def.style;
					if (!res) return;
					if (Array.isArray(res)) return res;
					if (res.cssText !== undefined) return res;
					if (typeof res === 'string') {
						if (!styleCtx.unsafeCSS) throw new Error('[fstage/component] def.style returned a string but unsafeCSS is not available');
						return styleCtx.unsafeCSS(res);
					}
					throw new Error('[fstage/component] def.style must return a string, CSSResult, or array of CSSResults.');
				}

				constructor() {
					super();

					const ctx = this.__ctx = {};

					this.__internal = {
						cleanup:           [],
						tracker:           [],
						toggleControllers: {},
						activateState:     {},
						watchState:        {},  // stores { val } for post-render watch change detection
						state:             def.state,
						def:               def,
						id:                (++idCounter)
					};

					[ 'html', 'css', 'svg', 'repeat', 'classMap' ].forEach(function(key) {
						if (renderCtx[key]) ctx[key] = renderCtx[key];
					});

					ctx.host   = this;
					ctx.root   = null;
					ctx.state  = createStateProxy(this, store, def.stateGetters);
					ctx.config = config.config || {};

					ctx.cleanup = (fn) => {
						if (this.isConnected && typeof fn === 'function') {
							this.__internal.cleanup.push(fn);
						}
					};

					ctx.emit = (type, detail, opts) => {
						return config.interactionsManager.dispatch(this, type, detail, opts);
					};

					if (config.animator && typeof config.animator.animate === 'function') {
						ctx.animate = (el, preset, opts) => config.animator.animate(el, preset, opts);
					}

					// Declarative computed — DEPRECATED, kept for backwards compatibility.
					// Prefer state getters: get isEmpty() { return this.state.items.length === 0; }
					if (Object.keys(def.computed).length) {
						ctx.computed = {};
						for (var key in def.computed) {
							(function(k, fn) {
								Object.defineProperty(ctx.computed, k, {
									get: function() {
										try {
											return fn(ctx);
										} catch (err) {
											if (def.onError) def.onError(err, ctx);
											else console.error('[fstage/component] computed.' + k + ' error in ' + def.tag + ':', err);
										}
									},
									enumerable: true
								});
							})(key, def.computed[key]);
						}
					}

					// Inject services
					for (var i in def.inject) {
						const regKey = def.inject[i];
						if (ctx[i] !== undefined) throw new Error('[fstage/component] ctx.' + i + ' already exists');
						const service = config.registry.get(regKey);
						if (!service) throw new Error('[fstage/component] inject key not found in registry: ' + regKey);
						ctx[i] = service;
					}

					// Private instance bag — mutable by design; ctx itself is frozen after createRenderRoot.
					// Declare all imperative instance state here in constructed() so it is visible at a glance.
					ctx._ = {};

					if (def.constructed) def.constructed(ctx);
				}

				createRenderRoot() {
					const ctx = this.__ctx;
					if (ctx.root) return ctx.root;
					if (def.shadow) {
						ctx.root = super.createRenderRoot();
					} else {
						ctx.root = this;
						if (!this.constructor.__adopted) {
							this.constructor.__adopted = true;
							const styles = this.constructor.styles;
							if (styles) adoptStyleSheet(document, styles, def.tag);
						}
					}
					// Freeze ctx so no new properties can be added after setup.
					// ctx._ remains mutable — it is the designated private instance bag.
					Object.freeze(ctx);
					return ctx.root;
				}

				connectedCallback() {
					super.connectedCallback();

					const ctx      = this.__ctx;
					const internal = this.__internal;

					// Wire all watches — pre-render and post-render.
					// Post-render watches subscribe with default async delivery so state changes
					// trigger re-renders; the actual handler call happens in updated() after DOM commit.
					// Pre-render watches use { sync: true } to fire synchronously during mutation,
					// before the async render — required for state coordination and resets.
					for (var key in def.watch) {
						(function(key) {
							const descriptor = def.watch[key];

							if (descriptor.afterRender) {
								// Post-render: async delivery — triggers re-render when value changes.
								// Handler is called in updated() after DOM commit.
								ctx.state.$watch(key, function() { /* triggers re-render via reactive tracker */ });
								return;
							}

							// Pre-render: sync delivery — fires during state mutation before next render.
							function invoke(e) {
								try {
									if (descriptor.reset.length) {
										descriptor.reset.forEach(function(rKey) {
											const decl = def.state[rKey];
											ctx.state.$set(rKey, decl ? decl.default : undefined);
										});
									}
									if (descriptor.handler) descriptor.handler(e, ctx);
								} catch (err) {
									if (def.onError) def.onError(err, ctx);
									else console.error('[fstage/component] watch.' + key + ' error in ' + def.tag + ':', err);
								}
							}

							if (descriptor.immediate) {
								invoke({ path: key, val: ctx.state[key], oldVal: undefined });
							}

							ctx.state.$watch(key, invoke, { sync: true });
						})(key);
					}

					// Wire createToggle controllers for each toggle(selector) entry.
					if (config.animator && config.animator.createToggle) {
						const controllers = internal.toggleControllers;
						for (var tSel in def.animate.toggle) {
							(function(sel) {
								const entry = def.animate.toggle[sel];
								controllers[sel] = config.animator.createToggle({
									show: entry.show ? { preset: entry.show, durationFactor: entry.durationFactor } : null,
									hide: entry.hide ? { preset: entry.hide, durationFactor: entry.durationFactor } : null,
								});
							})(tSel);
						}
						ctx.cleanup(function() {
							const controllers = internal.toggleControllers;
							for (var s in controllers) controllers[s].cancel();
						});
					}

					// Wire exit animation observer.
					if (def.animate.exit && ctx.animate) {
						const observer = new MutationObserver(() => {
							if (this.hasAttribute(skipAttr)) {
								observer.disconnect();
								ctx.animate(ctx.host, def.animate.exit.preset, {
									durationFactor: def.animate.exit.durationFactor
								});
							}
						});
						observer.observe(this, { attributes: true, attributeFilter: [ skipAttr ] });
						ctx.cleanup(() => observer.disconnect());
					}

					if (def.connected) def.connected(ctx);

					if (def.activated) {
						ctx.cleanup(config.screenHost.on('activate', (e) => {
							if (!e.target || !e.target.contains(this)) return;
							def.activated(ctx);
						}));
					}

					if (def.deactivated) {
						ctx.cleanup(config.screenHost.on('deactivate', (e) => {
							if (!e.target || !e.target.contains(this)) return;
							def.deactivated(ctx);
						}));
					}
				}

				disconnectedCallback() {
					super.disconnectedCallback();

					const internal = this.__internal;

					while (internal.tracker.length) {
						const fn = internal.tracker.pop();
						if (fn) fn();
					}

					while (internal.cleanup.length) {
						const fn = internal.cleanup.pop();
						if (fn) fn();
					}

					if (def.disconnected) def.disconnected(this.__ctx);
				}

				performUpdate() {
					if (!this.isUpdatePending) return;
					if (this.closest('[' + skipAttr + ']')) return;

					const internal = this.__internal;
					internal.tracker = [];

					const dispose = store.$track(this, () => {
						super.performUpdate();
						return () => this.requestUpdate();
					});

					if (dispose) internal.tracker.push(dispose);
				}

				render() {
					const ctx = this.__ctx;
					if (!def.render) return ctx.html``;
					try {
						return def.render(ctx);
					} catch (err) {
						if (def.onError) def.onError(err, ctx);
						else console.error('[fstage/component] render error in ' + def.tag + ':', err);
						return ctx.html``;
					}
				}

				// Mirror prop values into the store BEFORE render so ctx.state reads the
				// current value in the same render cycle that caused the change.
				willUpdate(changedProperties) {
					super.willUpdate(changedProperties);
					const ctx = this.__ctx;
					changedProperties.forEach((oldVal, key) => {
						if (def.state[key] && def.state[key].$src === 'prop') {
							ctx.state.$set(key, this[key]);
						}
					});
				}

				updated(changedProperties) {
					super.updated(changedProperties);

					const ctx      = this.__ctx;
					const internal = this.__internal;

					const isFirst = !internal.rendered;
					if (isFirst) internal.rendered = true;

					// Wire interactions and bind on first render.
					if (isFirst && config.interactionsManager) {
						ctx.cleanup(config.interactionsManager.activate(def.interactions, ctx));
					}
					if (isFirst) {
						const bindCleanup = wireBind(def, ctx);
						if (bindCleanup) ctx.cleanup(bindCleanup);
					}

					// Entry animation — host only, first render.
					if (isFirst && def.animate.enter && ctx.animate) {
						ctx.animate(ctx.host, def.animate.enter.preset, {
							durationFactor: def.animate.enter.durationFactor
						});
					}

					// Toggle animations — delegated to createToggle controllers.
					// activate fires on falsy->truthy after first render.
					const controllers   = internal.toggleControllers;
					const activateState = internal.activateState;
					for (var sel in def.animate.toggle) {
						const entry      = def.animate.toggle[sel];
						const controller = controllers[sel];
						if (!controller) continue;
						const isVisible = !!ctx.state[entry.state];
						const el        = ctx.root ? ctx.root.querySelector(sel) : null;
						controller.update(el, isVisible);
						if (!isFirst && entry.activate && isVisible && !activateState[sel]) {
							if (el) ctx.animate(el, entry.activate, { durationFactor: entry.durationFactor });
						}
						activateState[sel] = isVisible;
					}

					// Post-render watches.
					// On first render: seed previous value without calling handlers.
					// On subsequent renders: call handler if the value has changed.
					const watchState = internal.watchState;
					for (var watchKey in def.watch) {
						const descriptor = def.watch[watchKey];
						if (!descriptor.afterRender) continue;

						const currentVal = ctx.state[watchKey];

						if (isFirst) {
							watchState[watchKey] = { val: currentVal };
							continue;
						}

						if (currentVal === watchState[watchKey].val) continue;

						const oldVal = watchState[watchKey].val;
						watchState[watchKey] = { val: currentVal };

						if (descriptor.handler) {
							try {
								descriptor.handler({ path: watchKey, val: currentVal, oldVal: oldVal }, ctx);
							} catch (err) {
								if (def.onError) def.onError(err, ctx);
								else console.error('[fstage/component] watch.' + watchKey + ' (afterRender) error in ' + def.tag + ':', err);
							}
						}
					}

					// host.attrs — applied every render.
					for (var attrName in def.host.attrs) {
						try {
							const attrVal = def.host.attrs[attrName](ctx);
							if (attrVal == null) ctx.host.removeAttribute(attrName);
							else ctx.host.setAttribute(attrName, attrVal);
						} catch (err) {
							if (def.onError) def.onError(err, ctx);
							else console.error('[fstage/component] host.attrs["' + attrName + '"] error in ' + def.tag + ':', err);
						}
					}

					// host.vars — applied every render.
					for (var varName in def.host.vars) {
						try {
							const varVal = def.host.vars[varName](ctx);
							ctx.host.style.setProperty(varName, String(varVal));
						} catch (err) {
							if (def.onError) def.onError(err, ctx);
							else console.error('[fstage/component] host.vars["' + varName + '"] error in ' + def.tag + ':', err);
						}
					}

					if (def.rendered) def.rendered(ctx, isFirst);
				}

			}

			// Mount host.methods onto the component prototype.
			for (var name in def.host.methods) {
				const fn = def.host.methods[name];
				if (typeof fn !== 'function') continue;
				(function(methodName, methodFn) {
					Component.prototype[methodName] = function() {
						return methodFn.apply(this, arguments);
					};
				})(name, fn);
			}

			customElements.define(def.tag, Component);
		},

	};

}
