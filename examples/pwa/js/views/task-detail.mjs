function _getTaskId(ctx) {
	var id = ctx.store.get('route.match.params.id');
	return id ? String(id) : null;
}

export default {

	tag: 'pwa-task-detail',

	inject: ['store', 'animator'],

	style: (ctx) => ctx.css`
		:host { display: block; }

		.body { padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 24px; }

		.title-input {
			font-size: 22px; font-weight: 700; color: var(--text-primary);
			background: none; border: none; border-bottom: 2px solid var(--separator);
			padding: 0 0 8px; width: 100%; outline: none; font-family: inherit;
			-webkit-appearance: none; transition: border-color 0.15s ease;
		}
		.title-input:focus { border-color: var(--color-primary); }
		.title-input.done  { color: var(--text-tertiary); text-decoration: line-through; }

		.section { background: var(--bg-base); border-radius: var(--radius-lg); overflow: hidden; }
		.section-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--separator); }
		.section-row:last-child { border-bottom: none; }

		.row-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
		.row-icon.blue   { background: var(--color-primary-subtle); color: var(--color-primary); }
		.row-icon.green  { background: var(--color-success-subtle); color: var(--color-success); }
		.row-icon.orange { background: var(--color-warning-subtle); color: var(--color-warning); }
		.row-icon.gray   { background: var(--bg-tertiary);          color: var(--text-secondary); }
		.row-icon svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; fill: none; }

		.row-label { font-size: 13px; color: var(--text-secondary); flex-shrink: 0; width: 80px; }

		.inline-input, .inline-textarea {
			flex: 1; background: none; border: none; outline: none;
			font-size: 15px; color: var(--text-primary); font-family: inherit; -webkit-appearance: none; padding: 0;
		}
		.inline-textarea { resize: none; min-height: 60px; line-height: 1.5; }

		.status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 500; }
		.status-badge.done { background: var(--color-success-subtle); color: var(--color-success); }
		.status-badge.open { background: var(--bg-tertiary);           color: var(--text-secondary); }

		.priority-row { display: flex; }
		.pri-btn {
			flex: 1; padding: 10px 8px; border: none; background: none;
			font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit;
			-webkit-tap-highlight-color: transparent; border-right: 1px solid var(--separator);
			color: var(--text-secondary);
			display: flex; align-items: center; justify-content: center; gap: 5px; transition: background 0.12s ease;
		}
		.pri-btn:last-child { border-right: none; }
		.pri-btn.active.high   { background: var(--color-danger-subtle);  color: var(--color-danger);  }
		.pri-btn.active.medium { background: var(--color-warning-subtle); color: var(--color-warning); }
		.pri-btn.active.low    { background: var(--bg-tertiary);          color: var(--text-secondary); }
		.pri-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

		.complete-btn {
			width: 100%; padding: 14px; border-radius: var(--radius-md); border: none;
			font-size: 16px; font-weight: 600; cursor: pointer;
			font-family: inherit; -webkit-tap-highlight-color: transparent; transition: opacity 0.15s ease;
		}
		.complete-btn.mark-done { background: var(--color-success); color: #fff; }
		.complete-btn.mark-open { background: var(--bg-base); color: var(--text-primary); border: 1.5px solid var(--separator); }

		.delete-btn {
			width: 100%; padding: 14px; border-radius: var(--radius-md);
			border: 1.5px solid var(--color-danger-subtle); background: var(--color-danger-subtle);
			color: var(--color-danger); font-size: 16px; font-weight: 600;
			cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
		}

		.not-found { padding: 48px 24px; text-align: center; color: var(--text-secondary); }
	`,

	interactions: {
		'change(.title-input)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (id) ctx.store.model('tasks').update(id, { title: e.matched.value });
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
			ctx.animator.animate(e.matched, 'pop', { duration: 260 });
		},
		'click(.delete-btn)': function(e, ctx) {
			var id = _getTaskId(ctx);
			if (!id) return;
			if (!confirm('Delete this task?')) return;
			ctx.store.model('tasks').delete(id);
		},
	},

	render: function(ctx) {
		var route = ctx.store.get('route');
		var id    = route && route.match && route.match.params && route.match.params.id;
		var tasks = ctx.store.get('tasks') || [];
		var t     = id ? tasks.find(function(task) { return task.id === String(id); }) || null : null;

		if (!t) return ctx.html`<div class="not-found">Task not found.</div>`;

		return ctx.html`
			<div class="body">

				<input
					class=${'title-input' + (t.completed ? ' done' : '')}
					type="text" .value=${t.title}
					aria-label="Task title"
				/>

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
						<input class="inline-input due-input" type="date"
							.value=${t.dueDate || ''}
						/>
					</div>
				</div>

				<div class="section">
					<div class="section-row" style="padding-bottom:0;border-bottom:none;">
						<div class="row-icon orange">
							<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
						</div>
						<span class="row-label">Priority</span>
					</div>
					<div class="priority-row">
						${['high', 'medium', 'low'].map(function(p) { return ctx.html`
							<button
								class=${t.priority === p ? 'pri-btn ' + p + ' active' : 'pri-btn ' + p}
								data-priority=${p}>
								<span class="pri-dot"></span>
								${p.charAt(0).toUpperCase() + p.slice(1)}
							</button>
						`; })}
					</div>
				</div>

				<div class="section">
					<div class="section-row">
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

				<button class="delete-btn" data-back>
					Delete Task
				</button>

			</div>
		`;
	},

};
