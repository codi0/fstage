// @fstage/component
//
// Definition-based web component runtime.
//
// Accepts component definition objects (per the Fstage Component Definition Standard) and registers them as custom elements.

import { getGlobalCss, stylesToString } from '../utils/index.mjs';


// --- Helpers

const compSheets = new Map();

function adoptSheet(root, sheet) {
	if (root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(sheet)) {
		root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
	}
}

function cssToSheet(css) {
	var sheet = null;
	var cssText = stylesToString(css);
	if (cssText) {
		sheet = new CSSStyleSheet();
		sheet.replaceSync(cssText);
	}
	return sheet;
}

function doDispatchEvent(el, type, details, opts) {
	opts = opts || {};
	var event = new CustomEvent(type, Object.assign({ bubbles: true, composed: true, detail: details || null }, opts));
	return el.dispatchEvent(event);
}


// --- Runtime Factory

export function createRuntime(config) {

	config = config || {};

	const helpers = config.ctx || {};
	const baseClass = config.baseClass || HTMLElement;

	const registry = config.registry;
	const interactionsManager = config.interactionsManager;

	// All reserved definition keys — not copied to the prototype
	const reserved = [
		'tag', 'shadow', 'globalStyles', 'props', 'state', 'inject', 'style', 'render',
		'interactions', 'init', 'connected', 'disconnected', 'rendered', 'onError'
	];

	return {

		define: function(def) {
			if (!def.tag || def.tag.indexOf('-') === -1) throw new Error('[fstage/component] Invalid tag: ' + def.tag);
			if (customElements.get(def.tag)) throw new Error('[fstage/component] Already defined: ' + def.tag);
			
			const defaults = {
				shadow: true,
				globalStyles: true,
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

			class Component extends baseClass {

				static get properties() {
					const props = {};
					for (var k in (def.props || {})) {
						const ps = def.props[k];
						props[k] = {
							attribute: ps.attr || false,
							reflect:   ps.reflect || false,
							// Accept constructor references (Number, Boolean) or legacy strings
							type: ps.type === Boolean || ps.type === 'boolean' ? Boolean
							    : ps.type === Number  || ps.type === 'number'  ? Number
							    : String
						};
					}
					return props;
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
					ctx.emit = function(type, detail, opts) {
						return doDispatchEvent(self, type, detail, opts);
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

					if (def.init) def.init(ctx);
				}

				createRenderRoot() {
					const ctx = this.__ctx;
					if (ctx.root) return ctx.root;

					if (!compSheets.has(def.tag)) {
						const styleText  = (typeof def.style === 'function') ? def.style(ctx) : (def.style || '');
						compSheets.set(def.tag, cssToSheet(styleText));
					}
					
					const styleSheet = compSheets.get(def.tag);

					if (def.shadow) {
						ctx.root = super.createRenderRoot();
						if (def.globalStyles) getGlobalCss().forEach(function(s) { adoptSheet(ctx.root, s); });
						if (styleSheet) adoptSheet(ctx.root, styleSheet);
					} else {
						ctx.root = this;
						if (styleSheet) adoptSheet(document, styleSheet);
					}
					return ctx.root;
				}

				connectedCallback() {
					const ctx = this.__ctx;
					super.connectedCallback();
					if (def.connected) def.connected(ctx);
				}

				disconnectedCallback() {
					const ctx        = this.__ctx;
					const cleanupFns = this.__cleanupFns;
					super.disconnectedCallback();

					while (cleanupFns.length > 0) {
						cleanupFns.pop()();
					}

					if (def.disconnected) def.disconnected(ctx);
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

				performUpdate() {
					const ctx = this.__ctx;

					if (!ctx.store || !ctx.store.trackAccess) {
						return super.performUpdate();
					}

					ctx.store.trackAccess(this, () => {
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

	};

}