import { LitElement } from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';
export * from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';

import { getGlobalCss, stylesToString, callSuper } from '../utils/index.mjs';


// private vars
var _count      = 0;
var _cache      = {};
var _defaults   = {};
var _registered = false;


// Parse inject value: 'source(key)' or legacy 'source:key'
function parseInjectValue(val) {
	var m = val.match(/^(\w+)\((.+)\)$/);
	if (m) return { prefix: m[1], key: m[2] };
	var parts = val.split(':');
	if (parts.length > 1) return { prefix: parts.shift(), key: parts.join(':') };
	return null;
}


// --- FsComponent -------------------------------------------------------------

export class FsComponent extends LitElement {

	static shadowDom = true;
	static globalCss = true;

	constructor() {
		super();
		_count++;
		this.__$id = _count;

		if (typeof this.willConstruct === 'function') {
			this.willConstruct();
		}

		// Apply injected defaults (store, registry, animator, etc.)
		for (var i in _defaults) {
			if (this[i] === undefined) {
				this[i] = _defaults[i];
			}
		}

		// Apply component-level static defaults
		var defaults = this.constructor.defaults;
		if (defaults) {
			for (var j in defaults) {
				if (this[j] === undefined) {
					this[j] = defaults[j];
				}
			}
		}

		this.prepareTracker();
		this.prepareInject();

		if (typeof this.constructed === 'function') {
			queueMicrotask(() => this.constructed());
		}
	}

	connectedCallback() {
		super.connectedCallback();
	}

	// firstUpdated fires once after first render — safe point to wire interactions.
	// Subclasses that override MUST call super.firstUpdated(...args).
	firstUpdated(...args) {
		if (super.firstUpdated) super.firstUpdated(...args);
		this.activateInteractions();
	}

	disconnectedCallback() {
		this.deactivateInteractions();
		super.disconnectedCallback();
	}

	createRenderRoot() {
		if (this.constructor.shadowDom) {
			var root = super.createRenderRoot();
			if (this.constructor.globalCss) {
				this.attachGlobalStyles(root, getGlobalCss());
			}
			return root;
		}
		// No shadow DOM — inject component styles into document root
		if (this.constructor.styles) {
			this.attachLocalStyles(this.getRootNode(), this.constructor.styles);
		}
		return this;
	}

	performUpdate() {
		var stopTracker = null;
		if (this.__$storeCache) {
			stopTracker = this.__$storeCache.cb();
			for (var i in this.__$storeCache.props) {
				var key          = this.__$storeCache.props[i];
				this[i]          = this.store.get(key);
				this[i + 'Meta'] = this.store.meta(key) || {};
			}
		}
		super.performUpdate();
		stopTracker && stopTracker();
	}

	prepareTracker() {
		if (this.store) {
			this.__$storeCache = {
				props: {},
				cb: () => this.store.trackAccess(() => this.requestUpdate(), { ctx: this }),
			};
		}
	}

	prepareInject() {
		if (!this.constructor.inject) return;
		for (var i in this.constructor.inject) {
			if (this[i] !== undefined) continue;
			var parsed = parseInjectValue(this.constructor.inject[i]);
			if (!parsed) continue;
			if (this.registry && parsed.prefix === 'registry') {
				this[i] = this.registry.get(parsed.key);
			}
			if (this.store && parsed.prefix === 'store') {
				this.__$storeCache.props[i] = parsed.key;
			}
		}
	}


	// --- Interaction system --------------------------------------------------
	//
	// Delegated to @fstage/interactions via this.interactionsManager (injected).
	// Components declare behaviour via static interactions:
	//
	//   static interactions = {
	//     'click(.btn)':           (e, t) => { ... },
	//     'gesture.swipe(.row)':   { directions: ['left','right'], onCommit(e) { ... } },
	//     'animate.enter':         { preset: 'slideUp', duration: 160 },
	//     'animate.exit':          { preset: 'slideDown', duration: 120 },
	//   };

	activateInteractions() {
		if (!this.constructor.interactions) return;
		if (!this.interactionsManager) return;
		this.__$interactionCleanup = this.interactionsManager.activate(this);
	}

	deactivateInteractions() {
		if (this.__$interactionCleanup) {
			this.__$interactionCleanup();
			this.__$interactionCleanup = null;
		}
	}


	// --- Style helpers -------------------------------------------------------

	attachGlobalStyles(root, styles) {
		if (!styles || !styles.length) return;
		for (var sheet of styles) {
			if (root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(sheet)) {
				root.adoptedStyleSheets.push(sheet);
			}
		}
	}

	attachLocalStyles(root, styles) {
		if (!styles) return;
		if (!root.__$cssCache) root.__$cssCache = new Map();
		var s        = stylesToString(styles);
		var cssSheet = root.__$cssCache.get(s);
		if (!cssSheet) {
			cssSheet = new CSSStyleSheet();
			cssSheet.replaceSync(s);
			root.__$cssCache.set(s, cssSheet);
		}
		if (root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(cssSheet)) {
			root.adoptedStyleSheets.push(cssSheet);
		}
	}

	callSuper(method, args = [], instance = this) {
		return callSuper(instance, method, args);
	}

}


// --- Module-level helpers ----------------------------------------------------

export function bindComponentDefaults(obj, register = true) {
	Object.assign(_defaults, obj || {});
	if (register) registerComponents();
}

export function registerComponents() {
	if (_registered) return;
	_registered = true;
	requestAnimationFrame(function() {
		for (var i in _cache) {
			_cache[i].register();
		}
	});
}

export function createComponent(tag, def, BaseClass = FsComponent) {
	if (typeof tag !== 'string') {
		BaseClass = def || BaseClass;
		def       = tag;
		tag       = null;
	}

	if (tag && customElements.get(tag)) {
		throw new Error(tag + ' already defined as a custom element');
	}

	if (typeof def === 'function' && def.prototype && def.prototype.constructor === def) {
		throw new Error('createComponent only accepts an object or function definition');
	}

	var constructor = null;

	class Component extends BaseClass {

		static register() {
			if (_cache[tag]) {
				delete _cache[tag];
				customElements.define(tag, Component);
			}
		}

		constructor() {
			super();
			if (constructor) constructor.call(this);
		}

	}

	if (typeof def === 'function') {
		Component.prototype.render = def;
	} else {
		const { static: s, constructor: c, ...i } = def;
		if (c) constructor = c;
		if (s) Object.assign(Component, s);
		Object.defineProperties(Component.prototype, Object.getOwnPropertyDescriptors(i));
	}

	_cache[tag] = Component;

	if (_registered) Component.register();

	return Component;
}
