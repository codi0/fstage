import { FsComponent, html, css } from '@fstage/component';

export class PwaApp extends FsComponent {

	static shadowDom = false;

	static inject = {
		'data-theme': 'store(settings.theme)',
	};

	static properties = {
		'data-theme': { type: String, reflect: true },
	};

	static styles = css`
		pwa-app {
			display: flex;
			flex-direction: column;
			width: 100%;
			height: 100%;
			min-height: 100dvh;
			background: var(--bg-secondary);
			color: var(--text-primary);
		}

		pwa-main {
			flex: 1 1 auto;
			position: relative;
			overflow: hidden;
			width: 100%;
			padding: 0;
			margin: 0;
			touch-action: pan-y;
			overscroll-behavior: none;
		}

		pwa-main > * {
			position: absolute;
			inset: 0;
			background: var(--bg-secondary);
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
			overscroll-behavior-y: contain;
			contain: layout style;
		}
	`;

	render() {
		return html`
			<pwa-main></pwa-main>
			<pwa-tab-bar></pwa-tab-bar>
		`;
	}
}

customElements.define('pwa-app', PwaApp);
