import { FsLitElement, html, css } from '@fstage/lit';

export class PwaAbout extends FsLitElement {

	static shadowDom = false;
  
	render() {
		return html`
		<pwa-header></pwa-header>
		<p>About</p>		
		`;
	}

}

customElements.define('pwa-about', PwaAbout);