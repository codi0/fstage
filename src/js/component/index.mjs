// @fstage/component
//
// Definition-based web component runtime, based on LitElement for maximum compatibility.
//
// Accepts component definition objects (per the Fstage Component Definition Standard) and registers them as custom elements.

import { adoptStyleSheet, getGlobalCss } from '../utils/index.mjs';


export function createRuntime(config) {

	config = config || {};

	const extensions = {};
	const helpers = config.ctx || {};
	const baseClass = config.baseClass || null;

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
				inject: [],
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
					const self       = this;
					const ctx        = this.__ctx = {};
					const cleanupFns = this.__cleanupFns = [];

					// Template helpers forwarded from runtime config
					ctx.html = helpers.html;
					ctx.css  = helpers.css;
					ctx.svg  = helpers.svg;

					// Host element and render root
					ctx.host = this;
					ctx.root = null;

					// ctx.props — thin alias for the host element; external props are already
					// reactive properties on the instance so no wrapper is needed
					ctx.props = this;

					// Initialise declared props with defaults
					for (var k in def.props) {
						this[k] = def.props[k].default;
					}

					// ctx.state — Proxy for local component state, seeded from def.state defaults.
					// Any write calls requestUpdate(key, oldValue) so LitElement's shouldUpdate
					// guard is satisfied and a re-render is triggered.
					const stateTarget = {};
					for (var k in (def.state || {})) {
						stateTarget[k] = def.state[k];
					}
					ctx.state = new Proxy(stateTarget, {
						get(target, key) {
							return target[key];
						},
						set(target, key, value) {
							var oldValue = target[key];
							target[key] = value;
							self.requestUpdate(key, oldValue);
							return true;
						}
					});

					// ctx.emit — dispatch a composed, bubbling CustomEvent from the host
					ctx.emit = (type, detail, opts) => {
						var event = new CustomEvent(type, Object.assign({ bubbles: true, composed: true, detail: detail || null }, opts || {}));
						return this.dispatchEvent(event);
					};

					// ctx.cleanup — register a teardown function run on disconnectedCallback
					ctx.cleanup = function(fn) {
						if (typeof fn === 'function') cleanupFns.push(fn);
					};

					// Resolve registry services
					def.inject.forEach(function(key) {
						if (ctx[key] !== undefined) {
							throw new Error('[fstage/component] ctx.' + key + ' already exists');
						}
						var service = registry ? registry.get(key) : undefined;
						if (service === undefined || service === null) {
							throw new Error('[fstage/component] inject key not found in registry: ' + key);
						}
						ctx[key] = service;
					});

					// Resolve extensions
					for (var key in extensions) {
						if (ctx[key] !== undefined) {
							throw new Error('[fstage/component] ctx.' + key + ' already exists');
						}
						var fn = extensions[key](ctx, cleanupFns);
						if (typeof fn === 'function') {
							ctx[key] = fn;
						}
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

					while (cleanupFns.length > 0) {
						cleanupFns.pop()();
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

					ctx.cleanup(ctx.store.trackAccess(this, () => {
						super.performUpdate();
						return () => this.requestUpdate();
					}));
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
						// into a plain object for ergonomic access in definition code
						var changed = {};
						changedProperties.forEach(function(oldVal, key) { changed[key] = oldVal; });
						def.rendered(ctx, changed);
					}
				}

			}

			// Copy any non-reserved, function-valued def keys onto the prototype
			// so imperative methods (e.g. overlay.mount) are available on the element
			for (var i in def) {
				if (reserved.includes(i)) continue;
				if (typeof def[i] !== 'function') continue;
				Component.prototype[i] = def[i];
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