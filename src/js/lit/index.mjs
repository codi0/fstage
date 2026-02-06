import { LitElement } from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';
export * from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';

import { getGlobalCss, stylesToString, callSuper } from '../utils/index.mjs';
import { createRegistry } from '../registry/index.mjs';
import { createStore } from '../store/index.mjs';


export class FsLitElement extends LitElement {

	static shadowDom = true;
	static globalCss = true;

	constructor() {
		//parent
		super();
		//call willConstruct?
		if(typeof this.willConstruct === 'function') {
			this.willConstruct();
		}
		//create registry?
		if(this.registry === undefined) {
			this.registry = createRegistry();
		}
		//create store?
		if(this.store === undefined) {
			this.store = createStore();
		}
		//cache store?
		if(this.store) {
			this.__$storeCache = {
				props: {},
				cb: () => {
					return this.store.trackAccess(() => this.requestUpdate(), { ctx: this });
				}
			};
		}
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
		//call constructed?
		if(typeof this.constructed === 'function') {
			queueMicrotask(() => this.constructed());
		}
	}

	createRenderRoot() {
		//use shadow dom?
		if(this.constructor.shadowDom) {
			//create root
			var root = super.createRenderRoot();
			//attach global styles?
			if(this.constructor.globalCss && root.adoptedStyleSheets) {
				root.adoptedStyleSheets.push(...getGlobalCss());
			}
			//return
			return root;
		}
		//attach local styles?
		if(this.constructor.styles) {
			//get root
			var root = this.getRootNode();
			//create stylesheet
			var styles = stylesToString(this.constructor.styles);
			const cssSheet = new CSSStyleSheet();
			cssSheet.replace(styles);
			//add stylesheet?
			if(root.adoptedStyleSheets && !root.adoptedStyleSheets.includes(cssSheet)) {
				root.adoptedStyleSheets.push(cssSheet)
			}
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

	callSuper(method, args = [], instance = this) {
		return callSuper(instance, method, args);
	}

}

export function createComponent(tag, def, BaseClass = FsLitElement) {
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

	//register element?
	if(tag && tag.length) {
		customElements.define(tag, Component);
	}

	//return
	return Component;
}