import { LitElement } from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';
export * from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';

import { getGlobalCss, stylesToString, callSuper } from '../utils/index.mjs';


//private vars
var _count = 0;
var _cache = {};
var _defaults = {};
var _registered = false;

//component class (extends Lit)
export class FsComponent extends LitElement {

	static shadowDom = true;
	static globalCss = true;

	constructor() {
		//parent
		super();
		//set ID
		_count++;
		this.__$id = _count;
		//call willConstruct?
		if(typeof this.willConstruct === 'function') {
			this.willConstruct();
		}
		//bind defaults
		for(var i in _defaults) {
			if(this[i] === undefined) {
				this[i] = _defaults[i];
			}
		}
		//prepare methods
		this.prepareTracker();
		this.prepareInject();
		//call constructed?
		if(typeof this.constructed === 'function') {
			queueMicrotask(() => this.constructed());
		}
	}

  connectedCallback() {
    super.connectedCallback();
    this.activateInteractions();
  }

  disconnectedCallback() {
    this.deactivateInteractions();
    super.disconnectedCallback();
  }

	createRenderRoot() {
		//use shadow dom?
		if(this.constructor.shadowDom) {
			//create root
			var root = super.createRenderRoot();
			//attach global styles?
			if(this.constructor.globalCss) {
				this.attachGlobalStyles(root, getGlobalCss());
			}
			//return
			return root;
		}
		//attach local styles?
		if(this.constructor.styles) {
			this.attachLocalStyles(this.getRootNode(), this.constructor.styles);
		}
		//no shadow
		return this;
	}

	performUpdate() {
		//set vars
		var stopTracker = null;
		//has store cache?
		if(this.__$storeCache) {
			//start tracking
			stopTracker = this.__$storeCache.cb();
			//get props from store
			for(var i in this.__$storeCache.props) {
				//get store key
				var key = this.__$storeCache.props[i];
				//set props
				this[i] = this.store.get(key);
				this[i + 'Meta'] = this.store.meta(key) || {};
			}
		}
		try {
			super.performUpdate();
		} finally {
			stopTracker && stopTracker();
		}
	}

	prepareTracker() {
		//cache store?
		if(this.store) {
			this.__$storeCache = {
				props: {},
				cb: () => {
					return this.store.trackAccess(() => this.requestUpdate(), { ctx: this });
				}
			};
		}
	}
	
	prepareInject() {
		//process inject?
		if(this.constructor.inject) {
			//loop through props
			for(var i in this.constructor.inject) {
				//prop already defined?
				if(this[i] !== undefined) {
					continue;
				}
				//split key into parts
				var key = this.constructor.inject[i];
				var parts = key.split(':');
				//valid syntax?
				if(parts.length > 1) {
					//get prefix
					var prefix = parts.shift();
					//update key
					key = parts.join(':');
					//is registry?
					if(this.registry && prefix === 'registry') {
						this[i] = this.registry.get(key);
					}
					//is store?
					if(this.store && prefix === 'store') {
						this.__$storeCache.props[i] = key;
					}
				}
			}
		}
	}
	
	activateInteractions() {
		//TO-DO
	}
	
	deactivateInteractions() {
		//TO-DO
	}

	attachGlobalStyles(root, styles) {
		//stop here?
		if(!styles) return;
		//loop through styles
		for(var sheet of styles) {
			//add stylesheet?
			if(root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(sheet)) {
				root.adoptedStyleSheets.push(sheet);
			}
		}
	}

	attachLocalStyles(root, styles) {
		//stop here?
		if(!styles) return;
		//create css cache?
		if(!root.__$cssCache) {
			root.__$cssCache = new Map();
		}
		//convert styles to string
		var s = stylesToString(styles);
		var cssSheet = root.__$cssCache.get(s);
		//create new sheet?
		if(!cssSheet) {
			cssSheet = new CSSStyleSheet();
			cssSheet.replaceSync(s);
			root.__$cssCache.set(s, cssSheet);
		}
		//add stylesheet?
		if(root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(cssSheet)) {
			root.adoptedStyleSheets.push(cssSheet);
		}
	}

	callSuper(method, args = [], instance = this) {
		return callSuper(instance, method, args);
	}

}

//bind default properties
export function bindComponentDefaults(obj, register=true) {
	Object.assign(_defaults, obj || {});
	if (register) registerComponents();
}

//register components wrapper
export function registerComponents() {
	//check flag
	if(_registered) return;
	_registered = true;
	//register components
	requestAnimationFrame(function() {
		for(var i in _cache) {
			_cache[i].register();
		}
	});
}

//create component wrapper
export function createComponent(tag, def, BaseClass = FsComponent) {
	//has tag name?
	if(typeof tag !== 'string') {
		BaseClass = def || BaseClass;
		def = tag;
		tag = null;
	}

	//is tag registered?
	if(tag && customElements.get(tag)) {
		throw new Error(tag + " already defined as a custom element");
	}
	
	//is class definition?
	if(typeof def === 'function' && def.prototype && def.prototype.constructor === def) {
		throw new Error("createComponent only accepts an object or function definition");
	}

	//set vars
	var constructor = null;

	//create component
	class Component extends BaseClass {

		static register() {
			if (_cache[tag]) {
				delete _cache[tag];
				customElements.define(tag, Component);
			}
		}

		constructor() {
			//parent
			super();
			//call constructor?
			if(constructor) {
				constructor.call(this);
			}
		}

	}

	//is function or object?
	if(typeof def === 'function') {
		//set render function
		Component.prototype.render = def;
	} else {
		//separate static & instance
		const { static: s, constructor: c, ...i } = def;
		//cache constructor
		if(c) constructor = c;
		//copy static
		if(s) Object.assign(Component, s);
		//copy instance
		Object.defineProperties(Component.prototype, Object.getOwnPropertyDescriptors(i));
	}
	
	//add to cache
	_cache[tag] = Component;

	//register now?
	if (_registered) {
		Component.register();
	}

	//return
	return Component;
}