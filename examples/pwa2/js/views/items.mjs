import { FsComponent, html, css } from '@fstage/component';
import { getTasks, toggleTask } from '../data/tasks.mjs';

export class PwaItems extends FsComponent {

  static styles = css`
    :host {
      display: block;
    }

    .top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .count {
      opacity: 0.8;
      font-size: 0.9rem;
    }

    .list {
      display: grid;
      gap: 0.75rem;
    }

    sl-card::part(base) {
      border-radius: 12px;
    }

    .row {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      justify-content: space-between;
    }

    .meta {
      min-width: 0;
      flex: 1 1 auto;
    }

    .title {
      font-weight: 600;
      margin: 0;
    }

    .desc {
      margin: 0.25rem 0 0 0;
      opacity: 0.85;
      font-size: 0.95rem;
      line-height: 1.35;
    }

    .chips {
      margin-top: 0.5rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .actions {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .open-link {
      text-decoration: none;
    }

    .footer {
      margin-top: 1.25rem;
      opacity: 0.75;
      font-size: 0.9rem;
    }
  `;

  constructor() {
    super();
    this.tasks = getTasks();
  }

  _priorityVariant(priority) {
    if (priority === 'high') return 'danger';
    if (priority === 'medium') return 'warning';
    return 'neutral';
  }

  _onToggle(id) {
    toggleTask(id);
    // Data is module-backed; re-render view.
    this.tasks = getTasks();
    this.requestUpdate();
  }

  render() {
    const total = this.tasks.length;
    const done = this.tasks.filter(t => t.completed).length;

    return html`
      <div class="top">
        <div>
          <h2>Tasks</h2>
          <div class="count">${done} / ${total} completed</div>
        </div>

        <a class="open-link" href="/settings">
          <sl-button size="small" variant="default">Settings</sl-button>
        </a>
      </div>

      <div class="list">
        ${this.tasks.map(t => html`
          <sl-card>
            <div class="row">
              <div class="meta">
                <p class="title">${t.title}</p>
                <p class="desc">${t.description}</p>

                <div class="chips">
                  <sl-badge variant="${this._priorityVariant(t.priority)}">
                    ${t.priority}
                  </sl-badge>

                  ${t.completed
                    ? html`<sl-badge variant="success">completed</sl-badge>`
                    : html`<sl-badge variant="neutral">open</sl-badge>`}
                </div>
              </div>

              <div class="actions">
                <sl-checkbox
                  ?checked=${t.completed}
                  @sl-change=${() => this._onToggle(t.id)}
                >
                  Done
                </sl-checkbox>

                <a class="open-link" href="/items/${t.id}">
                  <sl-button size="small" variant="primary">Open</sl-button>
                </a>
              </div>
            </div>
          </sl-card>
        `)}
      </div>

      <div class="footer">
        Tip: this is deliberately "baseline web" - no gesture/animation layer yet.
      </div>
    `;
  }
}

customElements.define('pwa-items', PwaItems);