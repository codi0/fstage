import { get } from '@fstage/core';
import { FsComponent, html, css } from '@fstage/component';

class PwaHeader extends FsComponent {

	static shadowDom = false;

	render() {
		return html`
			<ion-header>
				<ion-toolbar>
					<ion-buttons slot="start">
						<ion-back-button></ion-back-button>
					</ion-buttons>
					<ion-title>${get('config.name')}</ion-title>
					<ion-buttons slot="end">
						<ion-menu-button></ion-menu-button>
					</ion-buttons>
				</ion-toolbar>
			</ion-header>
		`;
	}

}

customElements.define('pwa-header', PwaHeader);