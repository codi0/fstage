import { get } from '@fstage/core';
import { FsLitElement, html, css } from '@fstage/lit';

const config = get('config');

export class PwaLayout extends FsLitElement {

	static shadowDom = false;
	
	static styles = css`
		.fs-app {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}
		.fs-outlet {
			flex: 1;
			position: relative;
			overflow: hidden;
		}
	`;

	render() {
		return html`
			<div class="fs-app">
				<header class="fs-header">
					${config.name}
				</header>
				<nav class="fs-menu">
					${Object.entries(config.routes).map(([key,val]) =>
						val.menu ? html`<a href="${key}">${val.title}</a>` : ''
					)}
				</nav>
				<main id="main-content" class="fs-outlet"></main>
			</div>
		`;
	}

}

customElements.define('pwa-layout', PwaLayout);