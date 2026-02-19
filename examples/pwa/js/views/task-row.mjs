import { FsComponent, html, css } from '@fstage/component';

export class PwaTaskRow extends FsComponent {

	static shadowDom = false;

	static defaults = {
		task:  null,
		index: 0,
	};

	static properties = {
		task:  { type: Object },
		index: { type: Number },
	};

	static interactions = {
		// Enter animation
		'animate.enter': { preset: 'slideUp', duration: 160 },

		// Check button — stopPropagation prevents data-href on row-content firing
		'click(.check-btn)': function(e, t) {
			e.stopPropagation();
			if (!this.task) return;
			this.store.model('tasks').toggle(this.task.id);
			this.animator.animate(t, 'pop', { duration: 300 });
		},

		// Swipe gesture on the moving content element
		'gesture.swipe(.row-content)': {
			directions: ['left', 'right'],
			onProgress(e) { this._onSwipeProgress(e); },
			onCommit(e)   { this._onSwipeCommit(e);   },
			onCancel()    { this._onSwipeCancel();     },
		},
	};

	static styles = css`
		pwa-task-row {
			display: block;
			position: relative;
			overflow: hidden;
			border-radius: var(--radius-md);
		}

		.reveal {
			position: absolute; inset: 0;
			display: flex; align-items: center;
			border-radius: var(--radius-md);
			pointer-events: none; opacity: 0;
			transition: opacity 0.1s ease;
		}

		.reveal-right { background: var(--color-success); justify-content: flex-start; padding-left: 20px; }
		.reveal-left  { background: var(--color-danger);  justify-content: flex-end;   padding-right: 20px; }

		.reveal svg { width: 22px; height: 22px; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; fill: none; }

		.row-content {
			display: flex; align-items: flex-start; gap: 12px;
			padding: 14px 16px; background: var(--bg-base);
			border-radius: var(--radius-md); position: relative; z-index: 1;
			will-change: transform;
		}

		.check-btn {
			flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%;
			border: 2px solid var(--separator-heavy); background: none;
			cursor: pointer; padding: 0;
			display: flex; align-items: center; justify-content: center; margin-top: 1px;
			-webkit-tap-highlight-color: transparent;
			transition: border-color 0.15s ease, background 0.15s ease;
		}

		.check-btn.done { border-color: var(--color-success); background: var(--color-success); }

		.check-btn svg { width: 13px; height: 13px; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; fill: none; opacity: 0; transition: opacity 0.1s ease; }
		.check-btn.done svg { opacity: 1; }

		.task-info { flex: 1; min-width: 0; }

		.task-title { font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.35; margin: 0 0 4px; transition: color 0.15s ease; }
		.task-title.done { color: var(--text-tertiary); text-decoration: line-through; }

		.task-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

		.due-date { font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 3px; }
		.due-date.overdue { color: var(--color-danger);  font-weight: 500; }
		.due-date.today   { color: var(--color-primary); font-weight: 500; }
		.due-date svg { width: 11px; height: 11px; stroke: currentColor; stroke-width: 2; fill: none; }

		.priority-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
		.priority-dot.high   { background: var(--color-danger);  }
		.priority-dot.medium { background: var(--color-warning); }
		.priority-dot.low    { background: var(--text-tertiary); }

		.chevron { flex-shrink: 0; color: var(--text-tertiary); align-self: center; }
		.chevron svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; fill: none; }
	`;

	updated(changed) {
		if (changed.has('index')) this.style.setProperty('--row-index', this.index);
	}

	_formatDate(dateStr) {
		if (!dateStr) return null;
		const today    = new Date().toISOString().split('T')[0];
		const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
		if (dateStr < today)      return { label: 'Overdue',   cls: 'overdue' };
		if (dateStr === today)    return { label: 'Today',     cls: 'today'   };
		if (dateStr === tomorrow) return { label: 'Tomorrow',  cls: ''        };
		const d = new Date(dateStr + 'T00:00:00');
		return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), cls: '' };
	}

	_onSwipeProgress(e) {
		const right = this.querySelector('.reveal-right');
		const left  = this.querySelector('.reveal-left');
		if (!right || !left) return;
		const show = e.direction === 'right' ? right : left;
		const hide = e.direction === 'right' ? left  : right;
		show.style.opacity = e.progress;
		hide.style.opacity = '0';
	}

	_onSwipeCommit(e) {
		if (!this.task) return;
		if (e.direction === 'right') this.store.model('tasks').toggle(this.task.id);
		else                         this.store.model('tasks').delete(this.task.id);
	}

	_onSwipeCancel() {
		const right = this.querySelector('.reveal-right');
		const left  = this.querySelector('.reveal-left');
		if (right) right.style.opacity = '0';
		if (left)  left.style.opacity  = '0';
	}

	render() {
		if (!this.task) return html``;
		const t        = this.task;
		const dateInfo = this._formatDate(t.dueDate);

		return html`
			<div class="reveal reveal-right" aria-hidden="true">
				<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
			</div>
			<div class="reveal reveal-left" aria-hidden="true">
				<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
			</div>

			<div class="row-content" data-href="/tasks/${t.id}">
				<button class="check-btn ${t.completed ? 'done' : ''}"
					aria-label="${t.completed ? 'Mark incomplete' : 'Mark complete'}"
					aria-pressed="${t.completed}">
					<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
				</button>

				<div class="task-info">
					<p class="task-title ${t.completed ? 'done' : ''}">${t.title}</p>
					<div class="task-meta">
						<span class="priority-dot ${t.priority}"></span>
						${dateInfo ? html`
							<span class="due-date ${dateInfo.cls}">
								<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
								${dateInfo.label}
							</span>
						` : ''}
					</div>
				</div>

				<span class="chevron" aria-hidden="true">
					<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
				</span>
			</div>
		`;
	}
}

customElements.define('pwa-task-row', PwaTaskRow);
