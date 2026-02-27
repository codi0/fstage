// @fstage/component
//
// Definition-based web component runtime, based on LitElement for maximum compatibility.
//
// Accepts component definition objects (per the Fstage Component Definition Standard) and registers them as custom elements.

import { copy, adoptStyleSheet, getGlobalCss } from '../utils/index.mjs';


function createProxy(target, label, onSet) {
  function err(op, prop) {
		if (onSet) {
			throw new Error(label + ' does not support ' + op + ' ("' + String(prop) + '")');
		} else {
			throw new Error(label + ' is read-only (' + op + ' "' + String(prop) + '")');
		}
  }

  return new Proxy(target, {
    get: function (t, p, r) { return Reflect.get(t, p, r); },
    has: function (t, p) { return Reflect.has(t, p); },
    ownKeys: function (t) { return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor: function (t, p) { return Reflect.getOwnPropertyDescriptor(t, p); },

    defineProperty: function (t, p) { err('defineProperty', p); },
    setPrototypeOf: function () { err('setPrototypeOf', '__proto__'); },
    preventExtensions: function () { err('preventExtensions', ''); },

		set: function (t, p, v) {
			if (!onSet) err('set', p);
			const o = t[p];
			const ok = Reflect.set(t, p, v);
			if (ok && o !== v) onSet(p, o, v);
			return ok;
		},

    deleteProperty: function (t, p) {
      if (!onSet) err('deleteProperty', p);
      if (!(p in t)) return true;
      const o = t[p];
			const ok = Reflect.deleteProperty(t, p);
      if (ok) onSet(p, o, undefined);
      return ok;
    }
  });
}


export function createRuntime(config) {

	config = config || {};

	const extensions = {};
	const helpers = config.ctx || {};
	const baseClass = config.baseClass || null;
	const deepCopy = !!config.deepCopy;

	const registry = config.registry;
	const interactionsManager = config.interactionsManager;

	// All reserved definition keys — not copied to the prototype
	const reserved = [
		'tag', 'shadow', 'globalStyles', 'props', 'state', 'inject', 'style', 'render',
		'interactions', 'constructed', 'connected', 'disconnected', 'rendered', 'onError'
	];

	return {

		define: function(def) {
			const defaults = {
				shadow: true,
				globalStyles: !!config.globalStyles,
				inject: {},
				props: {},
				state: {},
				interactions: {}
			};
			
			for (var i in defaults) {
				if (def[i] === undefined || def[i] === null) {
					def[i] = defaults[i];
				}
			}

			if (!baseClass) throw new Error('[fstage/component] baseClass required');
			if (!def.tag || def.tag.indexOf('-') === -1) throw new Error('[fstage/component] Invalid tag: ' + def.tag);
			if (customElements.get(def.tag)) throw new Error('[fstage/component] Already defined: ' + def.tag);

			class Component extends baseClass {

				static get properties() {
					const props = {};

					for (var k in (def.props || {})) {
						const ps = def.props[k];
						props[k] = {
							attribute: ps.attr || false,
							reflect:   ps.reflect || false,
							// Accept string or constructor reference (String, Number, Boolean)
							type: ps.type === Boolean || ps.type === 'boolean' ? Boolean
							    : ps.type === Number  || ps.type === 'number'  ? Number
							    : String
						};
					}

					return props;
				}
				
				static get styles() {
						if (!def.style) return;

						const res = typeof def.style === 'function' ? def.style(helpers) : def.style;
						if (!res) return;

						// Already a CSSResult (from css`` tag) — pass straight through
						if (res.cssText !== undefined) return res;

						// Plain string — wrap it
						if (typeof res === 'string') return helpers.unsafeCSS(res);

						throw new Error('[fstage/component] def.style must be a string or css template literal (or a function returning one)');
				}

				constructor() {
					super();

					// Per-instance context and cleanup store
					const ctx        = this.__ctx = {};
					const cleanupFns = this.__cleanupFns = [];

					// Host element and render root
					ctx.host = this;
					ctx.root = null;

					// Helpers forwarded from runtime config
					[ 'html', 'css', 'svg' ].forEach(function(key) {
						if (helpers[key]) ctx[key] = helpers[key];
					});

					// ctx.props — read only proxy
					ctx.props = createProxy(this, 'ctx.props');
					
					// ctx.state - writable proxy
					ctx.state = createProxy(copy(def.state, deepCopy), 'ctx.state', (key, oldVal, newVal) => {
						this.requestUpdate(key, oldVal);
					});

					// ctx.emit — dispatch a composed, bubbling CustomEvent from the host
					ctx.emit = (type, detail, opts) => {
						const event = new CustomEvent(type, Object.assign({ bubbles: true, composed: true, detail: detail || null }, opts || {}));
						return this.dispatchEvent(event);
					};
					
					// ctx.requestUpdate - request manual render
					ctx.requestUpdate = () => {
						this.requestUpdate();
					};

					// ctx.cleanup — register a teardown function run on disconnectedCallback
					ctx.cleanup = (fn) => {
						if (typeof fn === 'function') cleanupFns.push(fn);
					};

					// Resolve props defaults
					for (var k in def.props) {
						this[k] = def.props[k].default;
					}

					// Resolve registry services
					for (var ctxKey in def.inject) {
						const regKey = def.inject[ctxKey];
						if (ctx[ctxKey] !== undefined) {
							throw new Error('[fstage/component] ctx.' + ctxKey + ' already exists');
						}
						
						const service = registry.get(regKey);
						if (service === undefined || service === null) {
							throw new Error('[fstage/component] inject key not found in registry: ' + regKey);
						}

						ctx[ctxKey] = service;
					}

					// Resolve extensions
					for (var key in extensions) {
						if (ctx[key] !== undefined) {
							throw new Error('[fstage/component] ctx.' + key + ' already exists');
						}
						ctx[key] = extensions[key](ctx, cleanupFns);
					}

					if (def.constructed) def.constructed(ctx);
				}

				createRenderRoot() {
						const ctx = this.__ctx;
						if (ctx.root) return ctx.root;

						if (def.shadow) {
								ctx.root = super.createRenderRoot();
								if (def.globalStyles) getGlobalCss().forEach(function(s) { adoptStyleSheet(ctx.root, s); });
						} else {
								ctx.root = this;
								if (!this.constructor.__adopted) {
										this.constructor.__adopted = true;
										const styles = this.constructor.styles;
										if (styles) adoptStyleSheet(document, styles, def.tag);
								}
						}

						return ctx.root;
				}

				render() {
					const ctx = this.__ctx;
					if (!def.render) return ctx.html``;
					try {
						return def.render(ctx);
					} catch (err) {
						if (def.onError) {
							def.onError(err, ctx);
						} else {
							console.error('[fstage/component] render error in ' + def.tag + ':', err);
						}
						return ctx.html``;
					}
				}

				connectedCallback() {
					const ctx = this.__ctx;
					super.connectedCallback();
					
					if (def.connected) def.connected(ctx);
				}

				disconnectedCallback() {
					const ctx        = this.__ctx;
					const cleanupFns = this.__cleanupFns;
					const dispose = this.__disposeTracker;
					
					super.disconnectedCallback();

					while (cleanupFns.length > 0) {
						cleanupFns.pop()();
					}

					if (dispose) {
						dispose();
						this.__disposeTracker = null;
					}

					if (def.disconnected) def.disconnected(ctx);
				}

				performUpdate() {
					if (!this.isUpdatePending) {
						return;
					}

					const ctx = this.__ctx;

					if (!ctx.store || !ctx.store.trackAccess) {
						super.performUpdate();
						return;
					}

					// trackAccess: automatically triggers any previous dispose
					this.__disposeTracker = ctx.store.trackAccess(this, () => {
						super.performUpdate();
						return () => this.requestUpdate();
					});
				}

				firstUpdated(changedProperties) {
					const ctx        = this.__ctx;
					const cleanupFns = this.__cleanupFns;

					super.firstUpdated(changedProperties);

					if (interactionsManager && Object.keys(def.interactions).length) {
						const result = interactionsManager.activate(def.interactions, ctx);
						if (typeof result === 'function') cleanupFns.push(result);
					}
				}

				updated(changedProperties) {
					const ctx = this.__ctx;
					super.updated(changedProperties);

					if (def.rendered) {
						// Convert LitElement's changedProperties Map { key → previousValue }
						// into a plain object for ergonomic access in definition code.
						// Note: only declared props and state appear here — store reads
						// and other reactive sources are never reflected in changed.
						const changed = {};
						changedProperties.forEach(function(oldVal, key) { changed[key] = oldVal; });
						const isFirst = !this.__hasRendered;
						this.__hasRendered = true;
						def.rendered(ctx, changed, isFirst);
					}
				}

			}

			// Copy any special methods function onto the prototype
			// Allows imperative methods to be available on the element
			for (var i in def) {
				if (i.indexOf('__') !== 0) continue;
				if (typeof def[i] !== 'function') continue;

				(function(name, fn) {
					Component.prototype[name] = function() {
						return fn.apply(this, arguments);
					};
				})(i.slice(2), def[i]);
			}

			customElements.define(def.tag, Component);
		},

    extendCtx: function(key, fn) {
        if (reserved.includes(key)) {
					throw new Error('[fstage/component] extendCtx key reserved: ' + key);
				}
				if (typeof fn !== 'function') {
					throw new Error('[fstage/component] extendCtx fn must be a function');
				}
        extensions[key] = fn;
    }

	};

}