import { FsComponent, html, css } from '@fstage/component';
import { getTaskById, toggleTask, updateTask } from '../data/tasks.mjs';

export class PwaItemDetail extends FsComponent {

  static styles = css`
    :host {
      display: block;
    }

    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .back a {
      text-decoration: none;
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    sl-card::part(base) {
      border-radius: 12px;
    }

    .section {
      display: grid;
      gap: 0.75rem;
    }

    .row {
      display: grid;
      gap: 0.35rem;
    }

    .label {
      font-size: 0.9rem;
      opacity: 0.8;
    }

    .value {
      font-size: 1rem;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    // get task by ID
    this.id = this._readIdFromHash();
    this.task = getTaskById(this.id);
    // In case of in-place hash changes, keep it simple.
    this._hashHandler = () => this._refresh();
    globalThis.addEventListener('hashchange', this._hashHandler);
  }

  disconnectedCallback() {
    globalThis.removeEventListener('hashchange', this._hashHandler);
    super.disconnectedCallback();
  }

  _readIdFromHash() {
    // Expected: #/items/<id>
    const hash = globalThis.location.hash || '';
    const parts = hash.replace(/^#\/?/, '').split('/');
    // parts: ["items", "<id>"]
    return parts[1] || '';
  }

  _refresh() {
    this.id = this._readIdFromHash();
    this.task = getTaskById(this.id);
    this.requestUpdate();
  }

  _priorityVariant(priority) {
    if (priority === 'high') return 'danger';
    if (priority === 'medium') return 'warning';
    return 'neutral';
  }

  _toggleDone() {
    toggleTask(this.id);
    this.task = getTaskById(this.id);
    this.requestUpdate();
  }

  _setPriority(priority) {
    updateTask(this.id, { priority });
    this.task = getTaskById(this.id);
    this.requestUpdate();
  }

  render() {
    if (!this.task) {
      return html`
        <div class="top">
          <div class="back">
            <a href="/items"><sl-button size="small">Back</sl-button></a>
          </div>
        </div>

        <sl-alert variant="danger" open>
          Task not found.
        </sl-alert>
      `;
    }

    return html`
      <div class="top">
        <div class="back">
          <a href="/items"><sl-button size="small">Back</sl-button></a>
        </div>

        <a href="/about" style="text-decoration:none;">
          <sl-button size="small" variant="default">About</sl-button>
        </a>
      </div>

      <h2>${this.task.title}</h2>

      <sl-card>
        <div class="section">
          <div class="row">
            <div class="label">Description</div>
            <div class="value">${this.task.description}</div>
          </div>

          <div class="row">
            <div class="label">Priority</div>
            <div class="value">
              <sl-badge variant="${this._priorityVariant(this.task.priority)}">
                ${this.task.priority}
              </sl-badge>
            </div>
          </div>

          <div class="row">
            <div class="label">Status</div>
            <div class="value">
              ${this.task.completed
                ? html`<sl-badge variant="success">completed</sl-badge>`
                : html`<sl-badge variant="neutral">open</sl-badge>`}
            </div>
          </div>

          <div class="actions">
            <sl-button variant="primary" @click=${() => this._toggleDone()}>
              ${this.task.completed ? 'Mark as open' : 'Mark as done'}
            </sl-button>

            <sl-button variant="default" @click=${() => this._setPriority('low')}>Low</sl-button>
            <sl-button variant="default" @click=${() => this._setPriority('medium')}>Medium</sl-button>
            <sl-button variant="default" @click=${() => this._setPriority('high')}>High</sl-button>
          </div>
        </div>
      </sl-card>
    `;
  }
}

customElements.define('pwa-item-detail', PwaItemDetail);