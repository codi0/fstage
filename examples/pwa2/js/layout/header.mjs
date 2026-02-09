import { FsLitElement, html, css } from '@fstage/lit';
import { get } from '@fstage/core';

export class PwaHeader extends FsLitElement {

  static styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
    }

    .title {
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1;
    }

    ::slotted(*) {
      margin-left: auto;
    }
  `;

  render() {
    return html`
      <div class="header">
        <div class="title">${get('config.name')}</div>
        <!-- future actions slot -->
        <slot></slot>
      </div>
    `;
  }
}

customElements.define('pwa-header', PwaHeader);