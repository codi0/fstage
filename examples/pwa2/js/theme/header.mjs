import { get } from '@fstage/core';
import { FsLitElement, html, css } from '@fstage/lit';

const config = get('config');

class PwaHeader extends FsLitElement {

	static shadowDom = false;

	render() {
		return html`
			<div>Header!</div>
		`;
	}

}

customElements.define('pwa-header', PwaHeader);