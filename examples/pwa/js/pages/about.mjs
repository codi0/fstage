import { FsLitElement, html, css } from '@fstage/lit';

export class PwaAbout extends FsLitElement {

	static shadowDom = false;
  
	render() {
		return html`
		<pwa-header></pwa-header>
		<ion-content class="ion-padding">
			<p>This is a demonstration app, built with Fstage.js.</p>
			<p>Fstage is the glue that helps you roll your own framework to build progressive web apps.</p>
			<p>This app uses LitElement, Ionic, Capacitor and Fstage Store.</p>
			<p><a href="https://github.com/codi0/fstage" target="_blank">Build it your way &raquo;</a></p>
		</ion-content>		
		`;
	}

}

customElements.define('pwa-about', PwaAbout);