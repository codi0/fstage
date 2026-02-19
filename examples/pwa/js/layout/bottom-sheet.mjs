import { FsComponent, html, css } from '@fstage/component';

export class PwaBottomSheet extends FsComponent {

	static properties = {
		open:  { type: Boolean, reflect: true },
		title: { type: String },
	};

	static styles = css`
		:host { display: contents; }

		.sheet-backdrop {
			position: fixed; inset: 0;
			background: rgba(0,0,0,0);
			z-index: 100;
			transition: background 0.28s ease;
			pointer-events: none;
		}

		.sheet-backdrop.visible {
			background: rgba(0,0,0,0.45);
			pointer-events: auto;
		}

		.sheet-panel {
			position: fixed; left: 0; right: 0; bottom: 0;
			z-index: 101;
			background: var(--bg-base);
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding-bottom: var(--safe-bottom);
			max-height: 92dvh;
			display: flex; flex-direction: column;
			transform: translateY(100%);
			will-change: transform;
			box-shadow: 0 -2px 20px rgba(0,0,0,0.12);
		}

		.sheet-handle-row {
			display: flex; align-items: center; justify-content: center;
			padding: 10px 0 4px; flex-shrink: 0;
			touch-action: none; cursor: grab;
		}

		.sheet-handle {
			width: 36px; height: 4px; border-radius: 2px;
			background: var(--text-tertiary); opacity: 0.5;
		}

		.sheet-header {
			display: flex; align-items: center; justify-content: space-between;
			padding: 4px 16px 12px; flex-shrink: 0;
		}

		.sheet-title { font-size: 17px; font-weight: 600; color: var(--text-primary); }

		.sheet-close {
			width: 30px; height: 30px; border-radius: 50%;
			background: var(--bg-tertiary); border: none; cursor: pointer;
			display: flex; align-items: center; justify-content: center;
			color: var(--text-secondary); -webkit-tap-highlight-color: transparent; padding: 0;
		}

		.sheet-close svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }

		.sheet-body {
			flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 16px 16px;
		}
	`;

	static interactions = {

		'gesture.swipe(.sheet-handle-row)': {
				directions: ['down'],
				moveEl:     false,
				onProgress(e) { this._panel.style.transform = `translateY(${e.delta}px)`; console.log(e); },
				onCommit()    { this._close(); },
				onCancel()    { this._panel.style.transform = ''; },
		}
	
	};

	constructor() {
		super();
		this.open          = false;
		this.title         = '';
		this._onVVResize   = this._onVVResize.bind(this);
	}

	get _panel()    { return this.renderRoot.querySelector('.sheet-panel');    }
	get _backdrop() { return this.renderRoot.querySelector('.sheet-backdrop'); }

	updated(changed) {
		if (!changed.has('open')) return;

		const { _panel: panel, _backdrop: backdrop } = this;
		if (!panel || !backdrop) return;

		if (this.open) {
			backdrop.classList.add('visible');
			this.animator.animate(panel, 'slideUpSheet', { duration: 320 });
			this._startKeyboardWatch();
			// Focus first input once animation settles
			setTimeout(() => {
				const first = this.renderRoot.querySelector('slot')
					?.assignedElements({ flatten: true })
					.flatMap(el => [...el.querySelectorAll('input, textarea, [autofocus]')])
					.find(Boolean);
				if (first) first.focus();
			}, 320);
		} else {
			backdrop.classList.remove('visible');
			this.animator.animate(panel, 'slideDownSheet', { duration: 260 });
			this._stopKeyboardWatch();
		}
	}

	_startKeyboardWatch() {
		if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onVVResize);
	}

	_stopKeyboardWatch() {
		if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onVVResize);
		this.renderRoot.host?.style.removeProperty('--keyboard-offset');
	}

	_onVVResize() {
		const offset = Math.max(0, window.innerHeight - window.visualViewport.height);
		this._panel.style.transform = `translateY(-${offset}px)`;
	}

	_close() {
		this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
	}

	render() {
		return html`
			<div class="sheet-backdrop" @click=${this._close}></div>

			<div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${this.title}">

				<div class="sheet-handle-row">
					<div class="sheet-handle"></div>
				</div>

				<div class="sheet-header">
					<span class="sheet-title">${this.title}</span>
					<button class="sheet-close" @click=${this._close} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6"  y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>

				<div class="sheet-body">
					<slot></slot>
				</div>

			</div>
		`;
	}
}

customElements.define('pwa-bottom-sheet', PwaBottomSheet);
