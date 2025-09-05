import { LitElement } from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';
export * from 'https://cdn.jsdelivr.net/npm/lit-element@4/+esm';

import { getGlobalCss } from '../utils/index.mjs';
import { createStore } from '../store/index.mjs';


export class FsLitElement extends LitElement {

	static shadowDom = true;
	static globalCss = true;

    constructor() {
		//call parent
		super();
		//attach store?
		if(this.store === undefined) {
			this.store = createStore();
		}
		//setup callback
		this.__$storeCb = () => {
			this.requestUpdate();
			return this.updateComplete;
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

	update(changedProperties) {
		//query store?
		if(this.queryStore) {
			this.queryStore(this.store);
		}
		//return
		return super.update(changedProperties);
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