import { sectionHeader, emptyState } from '../../css/shared.mjs';
import { repeat } from 'lit/directives/repeat.js';

export default {

	tag: 'pwa-completed',

	inject: {
		models: 'models'
	},

	state: {
		tasks: { $src: 'external', key: 'tasks', default: [] }
	},

	computed: {
		completed: function(ctx) { return ctx.models.get('tasks').completed(); },
	},

	style: (styleCtx) => [
		sectionHeader,
		emptyState,
		styleCtx.css`
			:host { display: block; }
			.list-body { padding: 4px 16px calc(var(--tab-height) + var(--safe-bottom) + 16px); }
			.empty-icon { width: 64px; height: 64px; }
			.task-group { display: flex; flex-direction: column; }
		`
	],

	render: function(ctx) {
		var tasks = ctx.computed.completed;

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
						${repeat(
							tasks,
							function(task) { return String(task.$key || task.id); },
							function(task, i) { return ctx.html`<pwa-task-row .task=${task} .index=${i}></pwa-task-row>`; }
						)}
					</div>
				`}
			</div>
		`;
	},

};
