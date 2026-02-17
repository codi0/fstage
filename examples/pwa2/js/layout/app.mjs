import { FsComponent, html, css } from '@fstage/component';

export class PwaApp extends FsComponent {

	static shadowDom = false;

  static styles = css`
    pwa-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 100dvh;
      background: var(--sl-color-neutral-0);
      color: var(--sl-color-neutral-900);
    }

    pwa-header {
      flex: 0 0 auto;
      background: var(--sl-color-neutral-0);
      border-bottom: 1px solid var(--sl-color-neutral-200);
    }

		pwa-main {
			flex: 1 1 auto;
			position: relative;
			overflow: hidden;
			width: 100%;
			padding: 0;
			margin: 0 auto;
			touch-action: pan-y;
			overscroll-behavior: none;
		}

		pwa-main > * {
			position: absolute;
			inset: 0;
			padding: 1rem;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
			overscroll-behavior-y: contain;
			contain: content;
			will-change: transform;
		}
  `;

  render() {
    return html`
      <pwa-header></pwa-header>
      <pwa-main></pwa-main>
    `;
  }
}

customElements.define('pwa-app', PwaApp);