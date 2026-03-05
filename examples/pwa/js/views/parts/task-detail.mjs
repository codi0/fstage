function _getTaskId(ctx) {
	var id = ctx.state.routeParams.id;
	return id ? String(id) : null;
}

export default {

	tag: 'pwa-task-detail',

	state: {
		tasks:            { $src: 'store', default: {} },
		routeParams:      { $src: 'store', key: 'route.match.params', default: {} },
		confirmingDelete: false,
	},

	inject: {
		store:  'store',
		router: 'router',
	},

	style: (ctx) => ctx.css`
		:host { display: block; }

		.body { padding: 6px 16px 32px; display: flex; flex-direction: column; gap: 10px; }

		/* Serif display title */
		.title-display {
			font-family: var(--font-serif);
			font-size: 27px; font-weight: 400; color: var(--text-primary);
			letter-spacing: -0.025em; line-height: 1.2;
			padding: 0 2px 14px; border-bottom: 1.5px solid var(--separator-heavy);
			margin-bottom: 2px;
		}
		.title-display.done { color: var(--text-tertiary); text-decoration: line-through; }

		/* Hidden editable backing input */
		.title-input {
			position: absolute; opacity: 0; pointer-events: none;
			width: 1px; height: 1px;
		}

		/* Detail cards */
		.section { background: var(--bg-base); border-radius: var(--radius-lg); border: 1px solid var(--separator-heavy); overflow: hidden; box-shadow: var(--shadow-card); }
		.section-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid var(--separator); min-height: 50px; }
		.section-row:last-child { border-bottom: none; }

		.row-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
		.row-icon.green  { background: var(--chip-today-bg);  color: var(--chip-today-text); }
		.row-icon.blue   { background: #EEF4FF;               color: #3A6FD8; }
		.row-icon.amber  { background: var(--chip-late-bg);   color: var(--color-warning); }
		.row-icon.gray   { background: var(--bg-tertiary);    color: var(--text-tertiary); }
		.row-icon svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }

		.row-label { font-size: 13px; color: var(--text-tertiary); flex-shrink: 0; width: 68px; }

		/* Status badge */
		.status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; }
		.status-badge.done { background: var(--chip-today-bg); color: var(--chip-today-text); }
		.status-badge.open { background: var(--color-warning-subtle); color: var(--color-warning); }

		/* Due date input */
		.inline-input {
			flex: 1; background: none; border: none; outline: none;
			font-size: 14px; color: var(--text-secondary); font-family: inherit;
			-webkit-appearance: none; padding: 0;
		}

		/* Priority pills */
		.priority-row { display: flex; gap: 5px; flex: 1; }
		.pri-btn {
			flex: 1; text-align: center; padding: 6px 4px;
			border-radius: 8px; font-size: 11.5px; font-weight: 600;
			letter-spacing: 0.01em; border: 1.5px solid transparent;
			cursor: pointer; -webkit-tap-highlight-color: transparent;
			font-family: inherit; color: var(--text-quaternary);
			background: none; transition: all 0.12s ease;
		}
		.pri-btn.active.high   { background: var(--chip-late-bg);          color: var(--color-danger);  border-color: rgba(184,50,50,0.2); }
		.pri-btn.active.medium { background: var(--color-warning-subtle);  color: var(--color-warning); border-color: rgba(184,104,32,0.2); }
		.pri-btn.active.low    { background: var(--bg-tertiary);           color: var(--text-tertiary); border-color: var(--separator-heavy); }

		/* Notes */
		.section-row.notes-row { align-items: flex-start; padding-bottom: 11px; }
		.notes-row .row-icon   { margin-top: 2px; }
		.inline-textarea {
			flex: 1; background: none; border: none; outline: none; resize: none;
			font-size: 14px; line-height: 1.55; color: var(--text-secondary);
			font-family: inherit; -webkit-appearance: none; padding: 0; min-height: 48px;
		}

		/* Action buttons */
		.complete-btn {
			width: 100%; padding: 15px; border-radius: var(--radius-md); border: none;
			font-size: 15px; font-weight: 600; cursor: pointer; letter-spacing: -0.01em;
			font-family: inherit; -webkit-tap-highlight-color: transparent;
			transition: opacity 0.15s ease, transform 0.1s ease;
		}
		.complete-btn:active { transform: scale(0.97); }
		.complete-btn.mark-done {
			background: var(--color-primary-dark); color: #fff;
			box-shadow: var(--shadow-btn);
		}
		.complete-btn.mark-open {
			background: var(--bg-base); color: var(--text-primary);
			border: 1px solid var(--separator-heavy);
			box-shadow: var(--shadow-card);
		}

		.delete-btn {
			width: 100%; padding: 15px; border-radius: var(--radius-md);
			border: 1px solid var(--separator-heavy); background: var(--bg-base);
			color: var(--color-danger); font-size: 15px; font-weight: 600;
			cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
			box-shadow: var(--shadow-card);
			transition: transform 0.1s ease;
		}
		.delete-btn:active { transform: scale(0.97); }

		/* Delete confirm */
		.delete-confirm {
			display: flex; flex-direction: column; gap: 10px;
			background: var(--bg-base); border-radius: var(--radius-lg);
			border: 1px solid var(--separator-heavy);
			padding: 16px; box-shadow: var(--shadow-card);
		}
		.delete-confirm-msg { font-size: 15px; font-weight: 600; color: var(--text-primary); text-align: center; }
		.delete-confirm-sub { font-size: 13px; color: var(--text-tertiary); text-align: center; margin-top: -4px; }
		.delete-confirm-btns { display: flex; gap: 10px; margin-top: 4px; }
		.delete-cancel-btn {
			flex: 1; padding: 13px; border-radius: var(--radius-md);
			border: 1.5px solid var(--separator-heavy); background: none;
			color: var(--text-primary); font-size: 15px; font-weight: 500;
			cursor: pointer; font-family: inherit;
		}
		.delete-confirm-btn {
			flex: 1; padding: 13px; border-radius: var(--radius-md);
			border: none; background: var(--color-danger);
			color: #fff; font-size: 15px; font-weight: 600;
			cursor: pointer; font-family: inherit;
		}

		.not-found { padding: 48px 24px; text-align: center; color: var(--text-secondary); }
	`,

	interactions: {
		// Tapping the serif title triggers inline edit via hidden input
		'click(.title-display)': function(e, ctx) {
			var input = ctx.root.querySelector('.title-input');
			if (input) {
				input.style.position   = 'static';
				input.style.opacity    = '1';
				input.style.pointerEvents = 'auto';
				input.style.width      = '100%';
				input.style.height     = 'auto';
				input.focus();
			}
		},
		'change(.title-input)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (id) ctx.store.model('tasks').update(id, { title: e.matched.value });
			// re-hide input
			e.matched.style.position    = 'absolute';
			e.matched.style.opacity     = '0';
			e.matched.style.pointerEvents = 'none';
			e.matched.style.width       = '1px';
			e.matched.style.height      = '1px';
		},
		'blur(.title-input)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (id && e.matched.value.trim()) {
				ctx.store.model('tasks').update(id, { title: e.matched.value.trim() });
			}
			e.matched.style.position    = 'absolute';
			e.matched.style.opacity     = '0';
			e.matched.style.pointerEvents = 'none';
			e.matched.style.width       = '1px';
			e.matched.style.height      = '1px';
		},
		'change(.due-input)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (id) ctx.store.model('tasks').update(id, { dueDate: e.matched.value || null });
		},
		'click(.pri-btn)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (id) ctx.store.model('tasks').update(id, { priority: e.matched.dataset.priority });
		},
		'change(.inline-textarea)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (id) ctx.store.model('tasks').update(id, { description: e.matched.value });
		},
		'click(.complete-btn)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (!id) return;
			ctx.store.model('tasks').toggle(id);
			ctx.animate(e.matched, 'pop', { duration: 260 });
		},
		'click(.delete-btn)': function(e, ctx) {
			ctx.state.$set('confirmingDelete', true);
		},
		'click(.delete-cancel-btn)': function(e, ctx) {
			ctx.state.$set('confirmingDelete', false);
		},
		'click(.delete-confirm-btn)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (!id) return;
			ctx.store.model('tasks').delete(id);
			ctx.router.go(-1);
		},
	},

	render: function(ctx) {
		var id = ctx.state.routeParams.id;
		var t  = id ? ctx.state.tasks[String(id)] || null : null;

		if (!t) return ctx.html`<div class="not-found">Task not found.</div>`;

		var dueDate  = t.dueDate || '';
		var dueLabel = dueDate ? _fmtDue(dueDate) : 'None';

		return ctx.html`
			<div class="body">

				<div class=${'title-display' + (t.completed ? ' done' : '')}>${t.title}</div>
				<input class="title-input" type="text" .value=${t.title} aria-label="Task title"/>

				<div class="section">
					<div class="section-row">
						<div class=${t.completed ? 'row-icon green' : 'row-icon gray'}>
							<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
						</div>
						<span class="row-label">Status</span>
						<span class=${t.completed ? 'status-badge done' : 'status-badge open'}>
							${t.completed ? '✓ Completed' : 'Open'}
						</span>
					</div>
					<div class="section-row">
						<div class="row-icon blue">
							<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
						</div>
						<span class="row-label">Due</span>
						<input class="inline-input due-input" type="date" .value=${dueDate} aria-label="Due date"/>
					</div>
				</div>

				<div class="section">
					<div class="section-row">
						<div class="row-icon amber">
							<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
						</div>
						<span class="row-label">Priority</span>
						<div class="priority-row">
							${['high', 'medium', 'low'].map(function(p) { return ctx.html`
								<button
									class=${t.priority === p ? 'pri-btn ' + p + ' active' : 'pri-btn ' + p}
									data-priority=${p}>
									${p.charAt(0).toUpperCase() + p.slice(1)}
								</button>
							`; })}
						</div>
					</div>
				</div>

				<div class="section">
					<div class="section-row notes-row">
						<div class="row-icon gray">
							<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
						</div>
						<textarea class="inline-textarea" placeholder="Add notes…" rows="3"
							.value=${t.description || ''}
						></textarea>
					</div>
				</div>

				<button class=${t.completed ? 'complete-btn mark-open' : 'complete-btn mark-done'}>
					${t.completed ? 'Mark as Open' : 'Mark as Complete'}
				</button>

				${ctx.state.confirmingDelete ? ctx.html`
					<div class="delete-confirm">
						<div class="delete-confirm-msg">Delete this task?</div>
						<div class="delete-confirm-sub">This cannot be undone.</div>
						<div class="delete-confirm-btns">
							<button class="delete-cancel-btn">Cancel</button>
							<button class="delete-confirm-btn">Delete</button>
						</div>
					</div>
				` : ctx.html`
					<button class="delete-btn">Delete Task</button>
				`}

			</div>
		`;
	}

};

function _fmtDue(dateStr) {
	var today    = new Date().toISOString().split('T')[0];
	var tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
	if (dateStr === today)    return 'Today';
	if (dateStr === tomorrow) return 'Tomorrow';
	var d = new Date(dateStr + 'T00:00:00');
	return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
