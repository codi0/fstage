import { FsComponent, html, css } from '@fstage/component';

export class PwaToday extends FsComponent {

	static shadowDom = false;

	static inject = {
		tasks: 'store:tasks',
	};

	static styles = css`
		pwa-today { display: block; }

		.view-header {
			padding: var(--safe-top) 16px 0;
			background: var(--bg-secondary);
			position: sticky; top: 0; z-index: 10;
		}

		.view-title-row {
			display: flex; align-items: flex-end;
			justify-content: space-between; padding: 12px 0 8px;
		}

		.view-title { font-size: 28px; font-weight: 700; color: var(--text-primary); }
		.date-label { font-size: 13px; color: var(--text-secondary); padding-bottom: 2px; }

		.list-body { padding: 8px 16px 100px; }

		.section-header {
			font-size: 13px; font-weight: 600; color: var(--text-secondary);
			text-transform: uppercase; letter-spacing: 0.06em; padding: 20px 0 8px;
		}

		.task-group { display: flex; flex-direction: column; gap: 8px; }

		.empty-state { text-align: center; padding: 64px 24px 48px; color: var(--text-tertiary); }
		.empty-icon  { font-size: 52px; margin-bottom: 16px; }
		.empty-title { font-size: 20px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
		.empty-sub   { font-size: 15px; line-height: 1.4; }

		.progress-bar-wrap { height: 4px; background: var(--separator); border-radius: 2px; margin: 0 0 4px; overflow: hidden; }
		.progress-bar { height: 100%; background: var(--color-primary); border-radius: 2px; transition: width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
		.progress-label { font-size: 12px; color: var(--text-secondary); text-align: right; padding-bottom: 12px; }
	`;

	render() {
		const today    = new Date().toISOString().split('T')[0];
		const allToday = (this.tasks || []).filter(t => t.dueDate === today);
		const pending  = allToday.filter(t => !t.completed);
		const done     = allToday.filter(t =>  t.completed);
		const total    = allToday.length;
		const pct      = total ? Math.round((done.length / total) * 100) : 0;
		const dateStr  = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

		return html`
			<div class="view-header">
				<div class="view-title-row">
					<span class="view-title">Today</span>
					<span class="date-label">${dateStr}</span>
				</div>
				${total > 0 ? html`
					<div class="progress-bar-wrap">
						<div class="progress-bar" style="width:${pct}%"></div>
					</div>
					<div class="progress-label">${done.length} of ${total} done</div>
				` : ''}
			</div>

			<div class="list-body">
				${total === 0 ? html`
					<div class="empty-state">
						<div class="empty-icon">🌤</div>
						<div class="empty-title">Nothing due today</div>
						<div class="empty-sub">Tasks with today's due date will appear here.</div>
					</div>
				` : html`
					${pending.length > 0 ? html`
						<div class="section-header">To Do</div>
						<div class="task-group">
							${pending.map((task, i) => html`<pwa-task-row .task=${task} .index=${i}></pwa-task-row>`)}
						</div>
					` : ''}
					${done.length > 0 ? html`
						<div class="section-header">Completed</div>
						<div class="task-group">
							${done.map((task, i) => html`<pwa-task-row .task=${task} .index=${i}></pwa-task-row>`)}
						</div>
					` : ''}
				`}
			</div>
		`;
	}
}

customElements.define('pwa-today', PwaToday);
