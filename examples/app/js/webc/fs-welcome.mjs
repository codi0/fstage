export class FsWelcomeElement extends HTMLElement {

	constructor() {
		super();
		this.props = {};
		//console.log(this.tagName, 'constructor');
	}

	static get observedAttributes() {
		return [ 'name' ];
	}

	attributeChangedCallback(name, oldValue, newValue) {
		this.props[name] = newValue;
		this.generateHtml();
		//console.log(this.tagName, 'updated');
	}

	generateHtml() {
		if(this.props.name) {
			this.innerHTML = `Welcome to Fstage, ${this.props.name}!`;
		} else {
			this.innerHTML = `Loading...`;
		}
	}

}

customElements.define('fs-welcome', FsWelcomeElement);