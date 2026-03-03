export default {

	tag: 'pwa-today',

	state: {
		tasks: { $src: 'store', default: [] }
	},
	
	inject: {
		store: 'store'
	},

	style: (ctx) => ctx.css`
		:host { display: block; }

		.list-body { padding: 8px 16px 100px; }

		.section-header {
			font-size: 13px; font-weight: 600; color: var(--text-secondary);
			text-transform: uppercase; letter-spacing: 0.06em; padding: 20px 0 8px;
		}
		.section-header:first-child { padding-top: 8px; }
		.task-group { display: flex; flex-direction: column; gap: 8px; }

		.empty-state { text-align: center; padding: 64px 24px 48px; color: var(--text-tertiary); }
		.empty-icon  { font-size: 52px; margin-bottom: 16px; }
		.empty-title { font-size: 20px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
		.empty-sub   { font-size: 15px; line-height: 1.4; }
	`,

	render: function(ctx) {
		var today = ctx.store.model('tasks').today();

		return ctx.html`
			<div class="list-body">
				${today.all.length === 0 ? ctx.html`
					<div class="empty-state">
						<div class="empty-icon">🌤</div>
						<div class="empty-title">Nothing due today</div>
						<div class="empty-sub">Tasks with today's due date will appear here.</div>
					</div>
				` : ctx.html`
					${today.pending.length > 0 ? ctx.html`
						<div class="section-header">To Do</div>
						<div class="task-group">
							${today.pending.map(function(task, i) { return ctx.html`<pwa-task-row .task=${task} .index=${i}></pwa-task-row>`; })}
						</div>
					` : ''}
					${today.done.length > 0 ? ctx.html`
						<div class="section-header">Completed</div>
						<div class="task-group">
							${today.done.map(function(task, i) { return ctx.html`<pwa-task-row .task=${task} .index=${i}></pwa-task-row>`; })}
						</div>
					` : ''}
				`}
			</div>
		`;
	}

};
