import { FsComponent, html, css } from '@fstage/component';

export class PwaAbout extends FsComponent {

  static styles = css`
    :host {
      display: block;
    }

    h2 {
      margin: 0 0 0.75rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    p {
      margin: 0 0 0.75rem 0;
      line-height: 1.5;
      opacity: 0.9;
    }

    sl-card::part(base) {
      border-radius: 12px;
    }

    .actions {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .meta {
      font-size: 0.9rem;
      opacity: 0.7;
    }
  `;

  render() {
    return html`
      <h2>About</h2>

      <sl-card>
        <p>
          This is an example PWA built with Fstage and Shoelace.
        </p>

        <p>
          The goal of this app is <strong>not</strong> to look perfect, but to
          surface where web UIs feel different from native apps once real pages,
          scrolling, navigation, and forms are in place.
        </p>

        <p>
          Interaction, gesture, and animation layers are intentionally minimal
          or disabled at this stage.
        </p>

        <div class="meta">
          Version: example / UI baseline
        </div>
      </sl-card>

      <div class="actions">
        <a href="/" style="text-decoration:none;">
          <sl-button variant="primary">Home</sl-button>
        </a>

        <a href="/items" style="text-decoration:none;">
          <sl-button variant="default">Tasks</sl-button>
        </a>
      </div>
    `;
  }
}

customElements.define('pwa-about', PwaAbout);