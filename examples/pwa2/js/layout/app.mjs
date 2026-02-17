import { FsComponent, html, css } from '@fstage/component';

export class PwaApp extends FsComponent {

	static shadowDom = false;

  static styles = css`
    pwa-app {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
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
			padding: 0;
		}

		pwa-screen {
			position: absolute;
			inset: 0;
			padding: 1rem;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}

    @media (min-width: 768px) {
			pwa-main {
        max-width: 960px;
        margin: 0 auto;
        width: 100%;
      }
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