import { FsComponent, html, css } from '@fstage/component';

export class PwaSettings extends FsComponent {

  static styles = css`
    :host {
      display: block;
    }

    h2 {
      margin: 0 0 1rem 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .section {
      display: grid;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    sl-card::part(base) {
      border-radius: 12px;
    }

    .row {
      display: grid;
      gap: 0.25rem;
    }

    .hint {
      font-size: 0.9rem;
      opacity: 0.75;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
  `;

  constructor() {
    super();

    // Frontend-only, local state
    this.settings = {
      darkMode: false,
      notifications: true,
      username: 'Guest',
      density: 'comfortable'
    };
  }

  _update(key, value) {
    this.settings = {
      ...this.settings,
      [key]: value
    };
    this.requestUpdate();
  }

  render() {
    return html`
      <h2>Settings</h2>

      <sl-card>
        <div class="section">

          <div class="row">
            <sl-switch
              ?checked=${this.settings.darkMode}
              @sl-change=${e => this._update('darkMode', e.target.checked)}
            >
              Dark mode
            </sl-switch>
            <div class="hint">
              This doesn't actually change the theme yet - on purpose.
            </div>
          </div>

          <div class="row">
            <sl-switch
              ?checked=${this.settings.notifications}
              @sl-change=${e => this._update('notifications', e.target.checked)}
            >
              Notifications
            </sl-switch>
            <div class="hint">
              Toggle to feel focus, tap, and switch behaviour.
            </div>
          </div>

        </div>
      </sl-card>

      <sl-card>
        <div class="section">

          <div class="row">
            <sl-input
              label="Username"
              value=${this.settings.username}
              @sl-input=${e => this._update('username', e.target.value)}
            ></sl-input>
            <div class="hint">
              Text input focus, keyboard behaviour, and blur handling.
            </div>
          </div>

          <div class="row">
            <sl-select
              label="Content density"
              value=${this.settings.density}
              @sl-change=${e => this._update('density', e.target.value)}
            >
              <sl-option value="comfortable">Comfortable</sl-option>
              <sl-option value="compact">Compact</sl-option>
            </sl-select>
            <div class="hint">
              Dropdown interaction differences show up quickly on touch.
            </div>
          </div>

        </div>
      </sl-card>

      <div class="actions">
        <a href="/items" style="text-decoration:none;">
          <sl-button variant="primary">Back to tasks</sl-button>
        </a>

        <a href="/" style="text-decoration:none;">
          <sl-button variant="default">Home</sl-button>
        </a>
      </div>
    `;
  }
}

customElements.define('pwa-settings', PwaSettings);