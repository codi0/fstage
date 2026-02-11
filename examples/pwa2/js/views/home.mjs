import { FsComponent, html, css } from '@fstage/component';

export class PwaHome extends FsComponent {

	static shadowDom = false;

  static styles = css`
    :host {
      display: block;
    }

    h2 {
      margin: 0 0 1rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .grid {
      display: grid;
      gap: 1rem;
    }

    @media (min-width: 600px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    sl-card::part(base) {
      border-radius: 12px;
      cursor: pointer;
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      height: 100%;
    }

    .title {
      font-weight: 600;
      font-size: 1rem;
    }

    .desc {
      opacity: 0.85;
      line-height: 1.4;
      flex: 1 1 auto;
    }

    .action {
      margin-top: 0.5rem;
      align-self: flex-start;
    }

    a {
      text-decoration: none;
      color: inherit;
    }
  `;

  render() {
    return html`
      <div class="grid">

        <a href="/items">
          <sl-card>
            <div class="card">
              <div class="title">Tasks</div>
              <div class="desc">
                View and manage tasks in a scrollable list with detail pages.
              </div>
              <div class="action">
                <sl-button size="small" variant="primary">Open</sl-button>
              </div>
            </div>
          </sl-card>
        </a>

        <a href="/settings">
          <sl-card>
            <div class="card">
              <div class="title">Settings</div>
              <div class="desc">
                Adjust basic preferences and experience form interactions.
              </div>
              <div class="action">
                <sl-button size="small" variant="default">Open</sl-button>
              </div>
            </div>
          </sl-card>
        </a>

        <a href="/about">
          <sl-card>
            <div class="card">
              <div class="title">About</div>
              <div class="desc">
                Learn what this example app is for and how it's meant to be used.
              </div>
              <div class="action">
                <sl-button size="small" variant="default">Open</sl-button>
              </div>
            </div>
          </sl-card>
        </a>

      </div>
    `;
  }
}

customElements.define('pwa-home', PwaHome);