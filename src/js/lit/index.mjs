import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';
export * from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';

import { getGlobalCss } from '../utils/index.mjs';
import { createRegistry } from '../registry/index.mjs';
import { createStore } from '../store/index.mjs';


export class FsLitElement extends LitElement {

	static shadowDom = true;
	static globalCss = true;
	static thisHtml = false;

	constructor() {
		//parent
		super();
		//call defaults?
		if(typeof this.defaults === 'function') {
			this.defaults();
		}
		//attach registry?
		if(this.registry === undefined) {
			this.registry = createRegistry();
		}
		//attach store?
		if(this.store === undefined) {
			if(this.registry) {
				this.store = this.registry.get('store');
			}
			if(!this.store) {
				this.store = createStore();
			}
		}
		//attach html and css?
		if(this.constructor.thisHtml) {
			this.html = this.html || html;
			this.css = this.css || css;
		}
		//setup callback
		this.__$storeCb = () => {
			this.requestUpdate();
			return this.updateComplete;
		}
		//call constructed?
		if(typeof this.constructed === 'function') {
			queueMicrotask(() => this.constructed());
		}
	}

	super(method, args = [], instance = this) {
		//get parent prototype
		var proto = Object.getPrototypeOf(instance.constructor.prototype);
		//walk up the prototype chain
		while(proto && proto !== Object.prototype) {
			//method found?
			if(proto.hasOwnProperty(method)) {
				return proto[method].apply(instance, args);
			}
			//next level
			proto = Object.getPrototypeOf(proto);
		}
		//method not found
		throw new Error(`Method ${method} not found in prototype chain`);
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
			var styles = this._cssToString(this.constructor.styles);
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
		var stop = null;
		//store tracking?
		if(this.store) {
			//start tracking
			stop = this.store.trackAccess(this.__$storeCb, {
				ctx: this
			});
		}
		try {
			super.performUpdate();
		} finally {
			stop && stop();
		}
	}

	_cssToString(styles) {
		if('cssText' in styles) {
			styles = styles.cssText;
		} else if(Array.isArray(styles)) {
			styles = styles.map(s => this._cssToString(s)).join('\n');
		}
		return (styles || '').trim();
	}

}

export function createComponent(tagName, def = {}, baseClass = FsLitElement) {
	//has tag name?
	if(typeof tagName !== 'string') {
		baseClass = (typeof def === 'function') ? def : baseClass;
		def = tagName;
		tagName = null;
	}

	//already registered?
	if(tagName && customElements.get(tagName)) {
		throw new Error(tagName + " already defined as a custom element");
	}

	//separate static
	var statics = {};
	if(def.static) {
		statics = def.static;
		delete def.static;
	}

	//define class
	const newClass = class extends baseClass {
		constructor() {
			//parent
			super();
			//attach instance properties?
			if(typeof def !== 'function') {
				//loop through keys
				for(const k in def) {
					//is property?
					if(typeof def[k] !== 'function') {
						this[k] = def[k];
					}
				}
			}
		}
	}

	//attach static properties
	for(const k of Object.keys(statics)) {
		newClass[k] = statics[k];
	}

	//attach methods
	if(typeof def === 'function') {
		//add render function
		newClass.prototype.render = def;
	} else {
		//loop through keys
		for(const k of Object.keys(def)) {
			//is function?
			if(typeof def[k] === 'function') {
				//block constructor?
				if(k === 'constructor') {
					throw new Error("Cannot override constructor. Please use constructed instead");
				}
				newClass.prototype[k] = def[k];
			}
		}
	}
	
	//register custom element?
	if(tagName) {
		customElements.define(tagName, newClass);
	}

	//return
	return newClass;
}