import { sectionHeader, emptyState } from '../../css/shared.mjs';
import { repeat } from 'lit/directives/repeat.js';

export default {

	tag: 'pwa-completed',

	inject: {
		models: 'models'
	},

	state: {
		tasks: { $ext: 'tasks', default: [] },
		get completed() { return this.models.get('tasks').completed(); },
	},

	style: ({ css }) => [
		sectionHeader,
		emptyState,
		css`
			:host { display: block; }
			.list-body { padding: 4px 16px calc(var(--tab-height) + var(--safe-bottom) + 16px); }
			.empty-icon { width: 64px; height: 64px; }
			.task-group { display: flex; flex-direction: column; }
		`
	],

	render({ html, state }) {
		const { completed: tasks } = state;

		return html`
			<div class="list-body">
				${tasks.length === 0 ? html`
					<div class="empty-state">
						<svg class="empty-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
							<circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2.5"/>
							<path d="M20 32l8 8 16-16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<div class="empty-title">Nothing completed yet</div>
						<div class="empty-sub">Finished tasks will appear here.</div>
					</div>
				` : html`
					<div class="section-header">${tasks.length} completed</div>
					<div class="task-group">
						${repeat(
						tasks,
						function(task) { return String(task.$key || task.id); },
						function(task, i) { return html`<pwa-task-row .task=${task} .index=${i}></pwa-task-row>`; }
					)}
					</div>
				`}
			</div>
		`;
	},

};
