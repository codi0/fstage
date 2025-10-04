import { LitElement } from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';
export * from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';

import { getGlobalCss, stylesToString, callSuper } from '../utils/index.mjs';
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
		//create store?
		if(this.store === undefined) {
			this.store = createStore();
		}
		//use store?
		if(this.store) {
			//set callback
			this.__$storeCb = () => {
				return this.store.trackAccess(() => this.requestUpdate(), { ctx: this });
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
		//store tracking?
		if(this.__$storeCb) {
			stopTracker = this.__$storeCb();
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
		//cache constructor?
		if(c) constructor = c;
		//copy static?
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