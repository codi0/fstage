import { config } from '@fstage/core';
import { FsLitElement, html, css } from '@fstage/lit';

class PwaHeader extends FsLitElement {

	static shadowDom = false;

	render() {
		return html`
			<ion-header>
				<ion-toolbar>
					<ion-buttons slot="start">
						<ion-back-button></ion-back-button>
					</ion-buttons>
					<ion-title>${config.name}</ion-title>
					<ion-buttons slot="end">
						<ion-menu-button></ion-menu-button>
					</ion-buttons>
				</ion-toolbar>
			</ion-header>
		`;
	}

}

customElements.define('pwa-header', PwaHeader);