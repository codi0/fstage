import { FsLitElement, html, css } from '@fstage/lit';

export class PwaHome extends FsLitElement {

	static shadowDom = false;

	render() {
		return html`
			<pwa-header></pwa-header>
			<p>Home</p>
		`;
	}

}

customElements.define('pwa-home', PwaHome);