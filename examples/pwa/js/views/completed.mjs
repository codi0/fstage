export default {

	tag: 'pwa-completed',

	state: {
		tasks: { $src: 'store', default: [] }
	},

	inject: {
		store: 'store'
	},

	style: (ctx) => ctx.css`
		:host { display: block; }

		.list-body { padding: 4px 16px calc(var(--tab-height) + var(--safe-bottom) + 16px); }

		.section-header {
			font-size: 10.5px; font-weight: 600; color: var(--text-quaternary);
			text-transform: uppercase; letter-spacing: 0.09em; padding: 14px 4px 7px;
		}
		[data-platform="android"] .section-header {
			text-transform: none; letter-spacing: 0.01em; font-size: 12px;
		}

		.task-group { display: flex; flex-direction: column; }

		.empty-state {
			display: flex; flex-direction: column; align-items: center;
			text-align: center; padding: 48px 24px;
		}
		.empty-icon  { width: 64px; height: 64px; margin-bottom: 16px; opacity: 0.3; color: var(--text-tertiary); }
		.empty-title { font-size: 17px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
		.empty-sub   { font-size: 15px; color: var(--text-tertiary); }
	`,

	render: function(ctx) {
		var tasks = ctx.store.model('tasks').completed();

		return ctx.html`
			<div class="list-body">
				${tasks.length === 0 ? ctx.html`
					<div class="empty-state">
						<svg class="empty-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
							<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.5"/>
							<path d="M20 32l8 8 16-16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<div class="empty-title">Nothing completed yet</div>
						<div class="empty-sub">Finished tasks will appear here.</div>
					</div>
				` : ctx.html`
					<div class="section-header">${tasks.length} completed</div>
					<div class="task-group">
						${tasks.map(function(task, i) {
							return ctx.html`<pwa-task-row key=${task.id} .task=${task} .index=${i}></pwa-task-row>`;
						})}
					</div>
				`}
			</div>
		`;
	}

};
