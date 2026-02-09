import { FsLitElement, html, css } from '@fstage/lit';

export class PwaApp extends FsLitElement {

	static shadowDom = false;

  static styles = css`
    :host {
      display: block;
      height: 100vh;
      width: 100%;
      overflow: hidden;
      background: var(--sl-color-neutral-0);
      color: var(--sl-color-neutral-900);
    }

    .app {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    header {
      flex: 0 0 auto;
      border-bottom: 1px solid var(--sl-color-neutral-200);
      background: var(--sl-color-neutral-0);
    }

    main {
      flex: 1 1 auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 1rem;
    }

    @media (min-width: 768px) {
      main {
        padding: 1.5rem;
        max-width: 960px;
        margin: 0 auto;
        width: 100%;
      }
    }
  `;

  render() {
    return html`
      <div class="app">
        <header>
          <pwa-header></pwa-header>
        </header>

        <main id="main-content">
          <!-- router renders views here -->
        </main>
      </div>
    `;
  }
}

customElements.define('pwa-app', PwaApp);